/**
 * React hook that manages GPS location tracking and pace calculation.
 *
 * Uses expo-location foreground watcher while the app is active, and
 * background location updates via TaskManager when backgrounded.
 * The background task feeds samples into a module-level buffer, drained by
 * `sync()` on every workout tick and on app resume.
 *
 * On Android builds with the workout session module, fixes come from the
 * session's foreground service instead, which needs no background permission.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  GpsSample,
  PaceState,
  PaceWindowSize,
  MAX_ACCURACY_METERS,
  createPaceState,
} from '../pace/paceTypes';
import {
  addSample,
  expireStalePace,
  pausePaceState,
  resetPaceState,
  resumePaceState,
} from '../pace/paceTracker';
import {
  addWorkoutSessionLocationListener,
  isWorkoutSessionSupported,
} from '../../modules/workout-session';

const BACKGROUND_LOCATION_TASK = 'pace-cue-background-location';

// ── Global sample buffer for background task ─────────────────────────
// The TaskManager task runs outside React, so it pushes samples into
// this buffer. The hook drains it on each workout tick and on app resume.
let backgroundSampleBuffer: GpsSample[] = [];

/** Define the background location task at module scope (required by TaskManager). */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Background location error:', error.message);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    for (const loc of locations) {
      backgroundSampleBuffer.push({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: loc.timestamp,
        accuracy: loc.coords.accuracy ?? 999,
        speed: loc.coords.speed,
        altitude: loc.coords.altitude ?? null,
        altitudeAccuracy: loc.coords.altitudeAccuracy ?? null,
      });
    }
  }
});

export interface PaceTrackerResult {
  paceState: PaceState;
  isTracking: boolean;
  permissionStatus: 'undetermined' | 'granted' | 'denied';
  /** Latest pace state, current even between renders. */
  getPaceState: () => PaceState;
  /**
   * Ingest samples buffered by the background task and clear a pace whose
   * newest sample has aged out of the window. Call on every workout tick,
   * since the background buffer is otherwise only drained on app resume.
   */
  sync: () => PaceState;
  /** Whether a pace has been computed at any point since the last reset. */
  hasHadPace: () => boolean;
  /** Full unpruned GPS track accumulated during the workout. */
  getFullTrack: () => GpsSample[];
  /** The full track split at each resume; no distance is counted between segments. */
  getTrackSegments: () => GpsSample[][];
  /** Ignore fixes and clear the current pace until `resume`. GPS stays on for a quick fix on resume. */
  pause: () => void;
  resume: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  /** Pick up a workout restored after the app was closed. Starts paused; call `resume` to take fixes again. */
  restore: (totalDistanceMeters: number, segments: GpsSample[][]) => void;
}

export function usePaceTracker(
  enabled: boolean,
  windowSeconds: PaceWindowSize,
): PaceTrackerResult {
  const [paceState, setPaceState] = useState<PaceState>(createPaceState);
  const [isTracking, setIsTracking] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<
    'undetermined' | 'granted' | 'denied'
  >('undetermined');

  const paceStateRef = useRef(paceState);
  paceStateRef.current = paceState;
  const windowRef = useRef(windowSeconds);
  windowRef.current = windowSeconds;
  const foregroundSubRef = useRef<Location.LocationSubscription | null>(null);
  const sessionLocationSubRef = useRef<{ remove(): void } | null>(null);
  const trackingRef = useRef(false);
  const trackSegmentsRef = useRef<GpsSample[][]>([[]]);
  /**
   * Newest sample timestamp ingested. The foreground watcher and background task can both deliver the same fixes.
   * Raised to the resume time on resume, so fixes taken during a pause are never ingested.
   */
  const lastSampleAtRef = useRef(0);
  const hadPaceRef = useRef(false);
  const pausedRef = useRef(false);

  const commit = useCallback((next: PaceState) => {
    if (next === paceStateRef.current) return;
    if (next.currentPaceMps != null) hadPaceRef.current = true;
    paceStateRef.current = next;
    setPaceState(next);
  }, []);

  /** Fold samples into the pace state, skipping any not newer than the last one ingested. */
  const ingest = useCallback(
    (samples: GpsSample[]) => {
      if (pausedRef.current) return;
      let state = paceStateRef.current;
      for (const sample of samples) {
        if (sample.timestamp <= lastSampleAtRef.current) continue;
        lastSampleAtRef.current = sample.timestamp;
        if (sample.accuracy <= MAX_ACCURACY_METERS) {
          trackSegmentsRef.current[trackSegmentsRef.current.length - 1].push(sample);
        }
        state = addSample(state, sample, windowRef.current);
      }
      commit(state);
    },
    [commit],
  );

  const processSample = useCallback((sample: GpsSample) => ingest([sample]), [ingest]);

  /** Drain any samples the background task buffered. */
  const drainBackgroundBuffer = useCallback(() => {
    if (backgroundSampleBuffer.length === 0) return;
    const buffered = backgroundSampleBuffer.sort((a, b) => a.timestamp - b.timestamp);
    backgroundSampleBuffer = [];
    ingest(buffered);
  }, [ingest]);

  const sync = useCallback(() => {
    drainBackgroundBuffer();
    commit(expireStalePace(paceStateRef.current, Date.now(), windowRef.current));
    return paceStateRef.current;
  }, [drainBackgroundBuffer, commit]);

  const getPaceState = useCallback(() => paceStateRef.current, []);
  const hasHadPace = useCallback(() => hadPaceRef.current, []);

  const pause = useCallback(() => {
    if (pausedRef.current) return;
    drainBackgroundBuffer();
    pausedRef.current = true;
    commit(pausePaceState(paceStateRef.current));
  }, [drainBackgroundBuffer, commit]);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    backgroundSampleBuffer = [];
    lastSampleAtRef.current = Math.max(lastSampleAtRef.current, Date.now());
    const segments = trackSegmentsRef.current;
    if (segments[segments.length - 1].length > 0) segments.push([]);
    commit(resumePaceState(paceStateRef.current));
  }, [commit]);

  /** Start GPS tracking. */
  const start = useCallback(async () => {
    if (trackingRef.current) return;

    // Never prompt here: the workout timer is already running. Permission is
    // requested from the pre-run screen and the post-run background offer.
    const { status: fgStatus } =
      await Location.getForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      setPermissionStatus('denied');
      return;
    }

    setPermissionStatus('granted');
    trackingRef.current = true;
    setIsTracking(true);
    backgroundSampleBuffer = [];

    // On Android the workout session (started by useWorkoutRunner for GPS
    // workouts) delivers fixes, including with the screen locked.
    if (isWorkoutSessionSupported) {
      sessionLocationSubRef.current = addWorkoutSessionLocationListener(processSample);
      return;
    }

    const { status: bgStatus } =
      await Location.getBackgroundPermissionsAsync();
    // Background permission is optional — foreground still works
    if (bgStatus !== 'granted') {
      console.warn('Background location not granted — pace tracking will pause when backgrounded');
    }

    // Start foreground watcher for real-time updates
    foregroundSubRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 3,
        timeInterval: 1000,
      },
      (loc) => {
        processSample({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
          accuracy: loc.coords.accuracy ?? 999,
          speed: loc.coords.speed,
          altitude: loc.coords.altitude ?? null,
          altitudeAccuracy: loc.coords.altitudeAccuracy ?? null,
        });
      },
    );

    // Start background location updates (survives backgrounding)
    if (bgStatus === 'granted') {
      try {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 2000,
          activityType: Location.ActivityType.Fitness,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'SplitCue',
            notificationBody: 'Tracking your running pace',
            notificationColor: '#4ADE80',
          },
        });
      } catch (e) {
        console.warn('Failed to start background location:', e);
      }
    }
  }, [processSample]);

  /** Stop GPS tracking. */
  const stop = useCallback(async () => {
    trackingRef.current = false;
    setIsTracking(false);

    if (foregroundSubRef.current) {
      foregroundSubRef.current.remove();
      foregroundSubRef.current = null;
    }
    sessionLocationSubRef.current?.remove();
    sessionLocationSubRef.current = null;

    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(
        BACKGROUND_LOCATION_TASK,
      );
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (e) {
      console.warn('Failed to stop background location:', e);
    }
  }, []);

  /** Reset pace state (e.g. new workout). */
  const reset = useCallback(() => {
    const fresh = resetPaceState();
    paceStateRef.current = fresh;
    setPaceState(fresh);
    backgroundSampleBuffer = [];
    trackSegmentsRef.current = [[]];
    lastSampleAtRef.current = 0;
    hadPaceRef.current = false;
    pausedRef.current = false;
  }, []);

  const restore = useCallback((totalDistanceMeters: number, segments: GpsSample[][]) => {
    const restored = pausePaceState({ ...createPaceState(), totalDistanceMeters });
    paceStateRef.current = restored;
    setPaceState(restored);
    backgroundSampleBuffer = [];
    trackSegmentsRef.current = segments.length > 0 ? segments.map((s) => [...s]) : [[]];
    lastSampleAtRef.current = 0;
    hadPaceRef.current = false;
    pausedRef.current = true;
  }, []);

  /** Return a snapshot of the full GPS track accumulated during this workout. */
  const getFullTrack = useCallback(() => trackSegmentsRef.current.flat(), []);
  const getTrackSegments = useCallback(
    () => trackSegmentsRef.current.filter((s) => s.length > 0).map((s) => [...s]),
    [],
  );

  // Drain background buffer when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && trackingRef.current) {
        drainBackgroundBuffer();
      }
    });
    return () => sub.remove();
  }, [drainBackgroundBuffer]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (foregroundSubRef.current) {
        foregroundSubRef.current.remove();
        foregroundSubRef.current = null;
      }
      sessionLocationSubRef.current?.remove();
      sessionLocationSubRef.current = null;
    };
  }, []);

  return {
    paceState,
    isTracking,
    permissionStatus,
    getPaceState,
    sync,
    hasHadPace,
    getFullTrack,
    getTrackSegments,
    pause,
    resume,
    start,
    stop,
    reset,
    restore,
  };
}
