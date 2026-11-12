/**
 * React hook that drives the workout engine and triggers audio/haptic cues.
 *
 * This is the bridge between the pure functional engine and the React UI.
 * It runs a high-frequency requestAnimationFrame loop while the workout is
 * active and fires cues at the right moments.
 *
 * On iOS, it also manages a Live Activity on the Lock Screen / Dynamic Island.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import {
  EngineState,
  WorkoutDefinition,
  AppSettings,
  CompletedWorkout,
  IntervalSplit,
  RoutePoint,
  generateId,
  IntervalType,
  isDistanceInterval,
  isUntimedInterval,
  hasDistanceFeature,
  QuickStartType,
  DISTANCE_INTERVAL_MAX_MS,
  estimatedPlannedSeconds,
} from '../workout/workoutTypes';
import {
  createEngineState,
  startWorkout,
  pauseWorkout,
  resumeWorkout,
  skipInterval,
  advanceInterval,
  stopWorkout,
  finishWorkout,
  currentInterval,
  remainingSeconds,
  remainingMs,
  intervalProgress,
  isIntervalExpired,
  totalRemainingSeconds,
  nextInterval,
} from '../workout/workoutEngine';
import {
  playCue,
  configureAudio,
  speakCuePhrases,
  startBackgroundLoop,
  stopBackgroundLoop,
  setVoiceIdentifier,
  setPremiumVoice,
  setDuckingEnabled,
} from '../audio/audioManager';
import {
  buildCueContext,
  intervalProgressCue,
  distanceProgressPhrase,
  distanceSplitCue,
  paceCue,
  type CueContext,
  type CuePhrase,
} from '../audio/cuePhrases';
import { cueDistanceMeters, nextCueMark, distanceProgressCuesNeedGps } from '../audio/cueSchedule';
import { usePaceTracker, type PaceTrackerResult } from './usePaceTracker';
import { useHeartRate } from './useHeartRate';
import {
  downsampleHeartRate,
  heartRateCoverage,
  recoveryDrop,
  sliceHeartRate,
  summarizeHeartRate,
} from '../heartRate/hrStats';
import type { HrConnection, WorkoutHeartRate } from '../heartRate/hrTypes';
import { createOdometer, type GpsSample, type PaceState } from '../pace/paceTypes';
import { advanceOdometer } from '../pace/paceTracker';
import {
  hapticIntervalChange,
  hapticWarning,
  hapticCountdown,
  hapticWorkoutComplete,
} from '../audio/haptics';
import { saveCompletedWorkout } from '../workout/workoutStorage';
import { saveHeartRateSamples } from '../heartRate/hrSampleStore';
import { getHrCloudConsent } from '../heartRate/hrConsent';
import { getHrConnection } from '../heartRate/hrMonitor';
import { trackHr } from '../analytics/hrEvents';
import { attachRunWeather } from '../weather/weatherService';
import {
  saveActiveSession,
  clearActiveSession,
  restoreSession,
  type ActiveSessionSnapshot,
} from '../workout/activeSession';
import { onlyCooldownRemains } from '../review/reviewSchedule';
import { track } from '../analytics/track';
import { getPowerSnapshot } from '../analytics/deviceInfo';
import { gpsQuality } from '../analytics/runContext';
import {
  buildWorkoutContext,
  getRunHistoryContext,
  runQualifies,
  markFirstRunTracked,
  type RunHistoryContext,
} from '../analytics/workoutContext';
import { rememberFalseStart, takeRestartContext } from '../analytics/falseStarts';
import type { WorkoutSource } from '../workout/tempWorkoutCache';
import {
  startLiveActivity,
  updateLiveActivity,
  endLiveActivity,
} from './useLiveActivity';
import { startWorkoutSession, stopWorkoutSession } from '../../modules/workout-session';

/** How long the Android workout session outlives the workout, so the completion cue can play. */
const SESSION_END_GRACE_MS = 10_000;

/** How often the in-progress workout is saved while running, for resume after the app is closed. */
const SESSION_SAVE_INTERVAL_MS = 15_000;
/** Saved 1 Hz samples needed before a recording counts toward the website's "Confirmed working" list. */
const MIN_CONFIRMED_HR_SAMPLES = 60;

/** Build a verbose CueContext from the engine state for rich voice announcements. */
function buildVerboseCueContext(
  state: EngineState,
  cueType: 'intervalStart' | 'warning',
  settings?: AppSettings,
): CueContext {
  const ci = currentInterval(state);
  if (!ci) return {};
  return {
    ...buildCueContext(ci, nextInterval(state), settings?.paceUnit),
    warningSeconds:
      cueType === 'warning' ? remainingSeconds(state) : undefined,
  };
}

/**
 * Convert raw GPS track segments into compact RoutePoints with cumulative distance.
 * Distance is not counted across segment boundaries (pauses).
 */
function samplesToRoute(segments: GpsSample[][]): RoutePoint[] {
  let cumDist = 0;
  const route: RoutePoint[] = [];
  for (const samples of segments) {
    let odometer = createOdometer();
    for (const sample of samples) {
      const step = advanceOdometer(odometer, sample);
      odometer = step.odometer;
      cumDist += step.meters;
      route.push({
        lat: sample.latitude,
        lng: sample.longitude,
        alt: sample.altitude,
        ts: sample.timestamp,
        dist: cumDist,
      });
    }
  }
  return route;
}

export interface WorkoutRunnerControls {
  state: EngineState;
  remaining: number; // seconds
  remainingMillis: number;
  progress: number; // 0..1
  totalRemaining: number; // seconds
  /** Time since Start, excluding pauses (seconds). */
  elapsedSeconds: number;
  currentLabel: string;
  currentType: string;
  nextLabel: string | null;
  intervalNumber: string; // e.g. "3 / 12"
  /** ID of the saved CompletedWorkout (available after finish). */
  completedEntryId: string | null;
  /** GPS route saved with the completed workout (available after finish). */
  completedRoute: RoutePoint[] | null;
  /** Interval splits captured during the workout (available after finish). */
  completedSplits: IntervalSplit[] | null;
  /** Heart rate saved with the completed workout (available after finish, when recorded). */
  completedHeartRate: WorkoutHeartRate | null;
  /** Whether the run reached the end, or was stopped with only the cooldown left. */
  runCompleted: boolean;

  // Pace tracking
  paceState: PaceState;
  isPaceTracking: boolean;

  /** Heart rate from the paired monitor; null when no monitor is paired. */
  heartRate: { bpm: number | null; connection: HrConnection } | null;

  // Distance tracking
  isDistanceInterval: boolean; // whether the current interval is distance-based
  intervalDistanceRemaining: number | null; // meters remaining for current distance interval
  intervalDistanceProgress: number; // 0..1 for distance intervals
  workoutDistanceTarget: number | null; // workout-level target distance (meters)
  workoutDistanceRemaining: number | null; // meters remaining for workout target

  /** Whether the current interval has no time or distance limit. */
  isOpenEnded: boolean;
  /** Time in the current interval, excluding pauses (seconds). */
  intervalElapsedSeconds: number;

  start: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  stop: () => void;
  /** End the run without saving it and return to the pre-run screen. */
  discard: () => void;
  /** Record that the run settings sheet was opened mid-run. */
  noteSettingsOpened: () => void;
}

/** Session metadata passed through from the temp cache to the history entry. */
export interface SessionMeta {
  source?: WorkoutSource;
  templateId?: string;
  planWorkoutId?: string;
  quickStartType?: QuickStartType;
}

export function useWorkoutRunner(
  workout: WorkoutDefinition,
  settings: AppSettings,
  sessionMeta?: SessionMeta,
  /** A workout left unfinished when the app was closed; the runner starts paused where it left off. */
  resumeFrom?: ActiveSessionSnapshot,
): WorkoutRunnerControls {
  const [restored] = useState(() => (resumeFrom ? restoreSession(resumeFrom) : null));
  const [engine, setEngine] = useState<EngineState>(() =>
    restored ? restored.engine : createEngineState(workout)
  );

  // Pace tracking
  const paceTracker = usePaceTracker(
    settings.paceTrackingEnabled,
    settings.paceWindow,
  );
  const paceTrackerRef = useRef(paceTracker);
  paceTrackerRef.current = paceTracker;

  // Refs for the animation loop so we have access to latest state
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const settingsRef = useRef(settings);
  /** Settings changed while the run was in progress, for analytics. */
  const midRunSettingsChangedRef = useRef(new Set<string>());
  if (settingsRef.current !== settings) {
    const phase = engineRef.current.phase;
    if (phase === 'running' || phase === 'paused') {
      for (const key of Object.keys(settings) as (keyof AppSettings)[]) {
        if (JSON.stringify(settingsRef.current[key]) !== JSON.stringify(settings[key])) {
          midRunSettingsChangedRef.current.add(key);
        }
      }
    }
  }
  settingsRef.current = settings;
  /** Whether GPS tracking was started for this workout. */
  const usesGpsRef = useRef(resumeFrom?.usesGps ?? false);
  /** Time spent paused, for the workout clock. */
  const pausedMsRef = useRef(restored?.pausedMs ?? 0);
  const pausedAtRef = useRef<number | null>(restored?.pausedAt ?? null);

  /** Workout time at `epoch`, excluding pauses (ms). */
  const workoutElapsedAt = useCallback((epoch: number) => {
    const startedAt = engineRef.current.startedAt;
    if (startedAt <= 0) return 0;
    const capped = pausedAtRef.current != null ? Math.min(epoch, pausedAtRef.current) : epoch;
    return Math.max(0, capped - startedAt - pausedMsRef.current);
  }, []);

  const heartRate = useHeartRate(() => workoutElapsedAt(Date.now()));
  const heartRateRef = useRef(heartRate);
  heartRateRef.current = heartRate;

  /** Stop GPS and heart rate recording; what was recorded stays available for the history entry. */
  const stopSensors = useCallback(() => {
    paceTrackerRef.current.stop();
    heartRateRef.current.stop();
  }, []);

  // Track which warnings we've already fired to avoid duplicates
  const firedWarnings = useRef(new Set<number>());
  const firedCountdowns = useRef(new Set<number>());
  /** Last announced step for interval progress (time or distance). */
  const lastProgressMark = useRef(0);
  /** Last announced step for pace cues (time or distance). */
  const lastPaceMark = useRef(0);
  /** Running time in the current interval, excluding pauses. Used when the interval has no duration. */
  const intervalElapsedMsRef = useRef(resumeFrom?.intervalElapsedMs ?? 0);
  const lastRunningTickAtRef = useRef(0);
  const lastIndex = useRef(restored ? restored.engine.currentIndex : -1);

  const cueScheduleKey = [
    settings.progressCueBasis,
    settings.progressCueDistance,
    settings.timeRemainingInterval,
    settings.paceCueBasis,
    settings.paceCueDistance,
    settings.paceCueFrequency,
    settings.paceUnit,
  ].join(':');
  const cueScheduleKeyRef = useRef(cueScheduleKey);
  if (cueScheduleKeyRef.current !== cueScheduleKey) {
    cueScheduleKeyRef.current = cueScheduleKey;
    lastProgressMark.current = 0;
    lastPaceMark.current = 0;
  }

  // Force re-render while running so the timer updates smoothly
  const [, setTick] = useState(0);
  const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);

  // Prevent saving history more than once per workout
  const historySaved = useRef(false);
  const [completedEntryId, setCompletedEntryId] = useState<string | null>(null);
  const [completedRoute, setCompletedRoute] = useState<RoutePoint[] | null>(null);
  const [completedSplits, setCompletedSplits] = useState<IntervalSplit[] | null>(null);
  const [completedHeartRate, setCompletedHeartRate] = useState<WorkoutHeartRate | null>(null);
  const [runCompleted, setRunCompleted] = useState(false);

  // ── Run context for analytics ─────────────────────────────────────
  const batteryAtStartRef = useRef<number | null>(null);
  const backgroundCountRef = useRef(0);
  const backgroundMsRef = useRef(0);
  const backgroundedAtRef = useRef<number | null>(null);
  const pauseCountRef = useRef(0);
  const skipCountRef = useRef(0);
  const settingsOpenedCountRef = useRef(0);
  const workoutRef = useRef(workout);
  workoutRef.current = workout;
  const sessionMetaRef = useRef(sessionMeta);
  sessionMetaRef.current = sessionMeta;
  /** Runs saved before this one, read before the run is saved to history. */
  const runHistoryRef = useRef<Promise<RunHistoryContext> | null>(null);
  if (!runHistoryRef.current) runHistoryRef.current = getRunHistoryContext();

  /** Track a workout end event with workout context, battery use, time backgrounded and GPS quality. */
  const trackRunEnd = useCallback(
    (eventName: string, props: Record<string, unknown>, qualifies: boolean) => {
      const backgroundMs =
        backgroundMsRef.current +
        (backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0);
      const workoutContext = {
        ...buildWorkoutContext(workoutRef.current, settingsRef.current, sessionMetaRef.current),
        gps_enabled: usesGpsRef.current,
      };
      const context = {
        background_count: backgroundCountRef.current,
        background_ms: backgroundMs,
        pause_count: pauseCountRef.current,
        skip_count: skipCountRef.current,
        mid_run_settings_opened: settingsOpenedCountRef.current,
        mid_run_settings_changed: [...midRunSettingsChangedRef.current],
        ...gpsQuality(paceTrackerRef.current.getFullTrack()),
        run_has_hr: heartRateRef.current.getSamples().length > 0,
      };
      const batteryStart = batteryAtStartRef.current;
      Promise.all([getPowerSnapshot(), runHistoryRef.current!]).then(([power, history]) => {
        track(eventName, {
          ...props,
          ...workoutContext,
          ...history,
          qualifies,
          run_number: qualifies ? history.prior_run_count + 1 : null,
          ...context,
          battery_start: batteryStart,
          battery_end: power.batteryLevel,
          battery_used:
            batteryStart != null && power.batteryLevel != null
              ? Math.round((batteryStart - power.batteryLevel) * 100) / 100
              : null,
        });
        if (qualifies && history.is_first_run) {
          markFirstRunTracked().then((first) => {
            if (first) {
              track('first_run_completed', {
                ...props,
                ...workoutContext,
                ...context,
              });
            }
          });
        }
      });
    },
    [],
  );

  // ── Per-interval split tracking ──────────────────────────────────
  const splitsRef = useRef<IntervalSplit[]>(resumeFrom?.splits ?? []);
  const intervalStartedAtRef = useRef(restored?.intervalStartedAt ?? 0); // epoch ms when current interval began
  const intervalStartDistanceRef = useRef(resumeFrom?.intervalStartDistance ?? 0); // distance (m) at interval start
  /** Workout time (pauses excluded) when the current interval began; advanced by `captureSplit`. */
  const intervalStartElapsedRef = useRef(resumeFrom?.intervalStartElapsedMs ?? 0);

  const lastSessionSaveAtRef = useRef(0);
  /** Save the in-progress workout so it can be resumed if the app is closed. */
  const persistSession = useCallback(() => {
    const s = engineRef.current;
    if (s.phase !== 'running' && s.phase !== 'paused') return;
    const tracker = paceTrackerRef.current;
    lastSessionSaveAtRef.current = Date.now();
    saveActiveSession({
      workout,
      sessionMeta,
      engine: s,
      pausedMs: pausedMsRef.current,
      pausedAt: pausedAtRef.current,
      splits: splitsRef.current,
      intervalStartedAt: intervalStartedAtRef.current,
      intervalStartDistance: intervalStartDistanceRef.current,
      intervalElapsedMs: intervalElapsedMsRef.current,
      usesGps: usesGpsRef.current,
      totalDistanceMeters: tracker.getPaceState().totalDistanceMeters,
      trackSegments: tracker.getTrackSegments(),
      intervalStartElapsedMs: intervalStartElapsedRef.current,
      hrSamples: heartRateRef.current.getSamples(),
      appState: AppState.currentState,
    });
  }, [workout, sessionMeta]);

  /** Snapshot the current interval's performance into a split record. */
  const captureSplit = useCallback((s: EngineState) => {
    const ci = currentInterval(s);
    if (!ci) return;
    const now = Date.now();
    const actualMs = intervalStartedAtRef.current > 0
      ? now - intervalStartedAtRef.current
      : ci.durationSeconds * 1000;

    const ps = paceTrackerRef.current.getPaceState();
    const distNow = ps.totalDistanceMeters;
    const intervalDist = distNow - intervalStartDistanceRef.current;
    const hasDist = settingsRef.current.paceTrackingEnabled && intervalDist > 1;

    const actualSec = actualMs / 1000;
    const mps = hasDist ? intervalDist / actualSec : null;
    const METERS_PER_MILE = 1609.344;
    const METERS_PER_KM = 1000;

    // A timed interval that expired before this tick (e.g. while backgrounded) ended at its scheduled time.
    const expiredEarlier = s.phase === 'running' && !isUntimedInterval(ci) && s.intervalEndsAt < now;
    const endElapsedMs = workoutElapsedAt(expiredEarlier ? s.intervalEndsAt : now);
    const startElapsedMs = Math.min(intervalStartElapsedRef.current, endElapsedMs);
    intervalStartElapsedRef.current = endElapsedMs;

    const hrSlice = sliceHeartRate(heartRateRef.current.getSamples(), startElapsedMs, endElapsedMs);
    const hr = summarizeHeartRate(hrSlice);
    const isRecovery = ci.segmentType === 'recovery' || ci.segmentType === 'rest';
    const drop = hr && isRecovery ? recoveryDrop(hrSlice) : null;

    splitsRef.current.push({
      label: ci.label,
      type: ci.type,
      plannedDurationSec: ci.durationSeconds,
      actualDurationMs: actualMs,
      distanceMeters: hasDist ? intervalDist : null,
      avgPaceMinPerMile: mps && mps > 0.3 ? METERS_PER_MILE / mps / 60 : null,
      avgPaceMinPerKm: mps && mps > 0.3 ? METERS_PER_KM / mps / 60 : null,
      targetPace: ci.targetPace,
      effort: ci.effort,
      segmentType: ci.segmentType,
      startElapsedMs,
      endElapsedMs,
      ...(hr ? { avgHr: hr.avg, maxHr: hr.max } : {}),
      ...(drop != null ? { hrRecoveryDrop: drop } : {}),
    });
  }, [workoutElapsedAt]);

  /** Mark the start of a new interval for split tracking. */
  const markIntervalStart = useCallback(() => {
    intervalStartedAtRef.current = Date.now();
    intervalStartDistanceRef.current = paceTrackerRef.current.getPaceState().totalDistanceMeters;
    intervalElapsedMsRef.current = 0;
    lastRunningTickAtRef.current = 0;
    lastProgressMark.current = 0;
    lastPaceMark.current = 0;
  }, []);

  /** Save a completed workout to history and expose its ID for tag editing. */
  const saveHistoryEntry = useCallback((elapsedMs: number, finished = true) => {
    if (historySaved.current) return;
    historySaved.current = true;
    const ps = paceTrackerRef.current.getPaceState();
    const trackSegments = paceTrackerRef.current.getTrackSegments();
    const allHrSamples = heartRateRef.current.getSamples();
    const hrSummary = summarizeHeartRate(allHrSamples);
    const hrSamples = downsampleHeartRate(allHrSamples);
    const entryId = generateId();
    if (hrSummary) saveHeartRateSamples(entryId, hrSamples);
    const entry: CompletedWorkout = {
      id: entryId,
      workoutId: workout.id,
      workoutName: workout.name,
      completedAt: Date.now(),
      totalDurationMs: elapsedMs,
      splits: [...splitsRef.current],
      totalDistanceMeters: ps.totalDistanceMeters > 0 ? ps.totalDistanceMeters : undefined,
      route: trackSegments.length > 0 ? samplesToRoute(trackSegments) : undefined,
      configuration: workout,
      templateId: sessionMeta?.templateId,
      planWorkoutId: sessionMeta?.planWorkoutId,
      quickStartType: sessionMeta?.quickStartType,
      heartRate: hrSummary
        ? {
            avg: hrSummary.avg,
            max: hrSummary.max,
            deviceName: heartRateRef.current.getDeviceName() ?? undefined,
            sampleCount: hrSamples.length,
          }
        : undefined,
    };
    setCompletedEntryId(entryId);
    setCompletedRoute(entry.route ?? null);
    setCompletedSplits(entry.splits ?? null);
    setCompletedHeartRate(entry.heartRate ?? null);
    if (entry.heartRate && finished) {
      const coverage = heartRateCoverage(hrSamples, elapsedMs);
      getHrCloudConsent().then((consent) => {
        trackHr('hr_workout_completed', {
          coverage_pct: Math.floor(coverage.fraction * 10) * 10,
          dropout_count: coverage.dropouts,
          cloud_consent: consent,
        });
      });
    }
    if (entry.heartRate && entry.heartRate.sampleCount >= MIN_CONFIRMED_HR_SAMPLES) {
      trackHr('hr_recording_saved', {
        device_name: entry.heartRate.deviceName ?? null,
        sample_count: entry.heartRate.sampleCount,
      });
    }
    saveCompletedWorkout(entry)
      .then(() => {
        clearActiveSession();
        return attachRunWeather(entry).catch((e) => console.warn('Failed to attach run weather:', e));
      })
      .catch((e) => console.warn('Failed to save workout history:', e));
    return entryId;
  }, [workout.id, workout.name, sessionMeta]);

  // Live Activity: throttle updates to ~1/sec to stay within the system budget
  const lastLAUpdate = useRef(0);
  const lastLAIndex = useRef(-1);

  /** Build Live Activity props from the current engine state. */
  const buildLAProps = useCallback(
    (s: EngineState, isPaused: boolean) => {
      const ci = currentInterval(s);
      const ni = nextInterval(s);
      const intervalNum =
        s.intervals.length > 0
          ? `${s.currentIndex + 1} / ${s.intervals.length}`
          : '';
      const untimed = !!ci && isUntimedInterval(ci);
      const durationMs = untimed ? DISTANCE_INTERVAL_MAX_MS : ci ? ci.durationSeconds * 1000 : 0;
      const startedAt = s.intervalEndsAt - durationMs;
      // The widget's timer counts up from a past date, so untimed intervals show elapsed time.
      return {
        intervalLabel: ci?.label || '',
        intervalType: (ci?.type || 'easy') as IntervalType,
        intervalEndsAt: untimed ? startedAt : s.intervalEndsAt,
        intervalStartedAt: startedAt,
        nextLabel: ni?.label || '',
        intervalNumber: intervalNum,
        workoutName: workout.name,
        isPaused,
        pausedRemainingMs: !isPaused ? 0 : untimed ? durationMs - s.pausedRemaining : s.pausedRemaining,
      };
    },
    [workout.name]
  );

  const tick = useCallback(() => {
    let s = engineRef.current;

    if (s.phase === 'running') {
      paceTrackerRef.current.sync();
      const nowMs = Date.now();
      if (lastRunningTickAtRef.current > 0) {
        intervalElapsedMsRef.current += nowMs - lastRunningTickAtRef.current;
      }
      lastRunningTickAtRef.current = nowMs;

      // Advance through ALL expired intervals in one pass.
      // When the app is backgrounded the JS timer can be delayed by seconds
      // (or longer), so multiple intervals may have elapsed.
      if (isIntervalExpired(s)) {
        // Capture split for the interval that just ended
        captureSplit(s);

        let next = advanceInterval(s);
        while (next.phase === 'running' && isIntervalExpired(next)) {
          // Capture split for each skipped-over interval (backgrounded catch-up)
          captureSplit(next);
          next = advanceInterval(next);
        }
        engineRef.current = next;
        setEngine(next);

        if (next.phase === 'finished') {
          // Workout complete
          playCue('workoutComplete', settingsRef.current.audioCueMode, {});
          if (settingsRef.current.hapticEnabled) hapticWorkoutComplete();
          stopBackgroundLoop();
          endLiveActivity();
          stopSensors();

          // Save to history (guard against duplicate saves)
          saveHistoryEntry(next.totalElapsedMs);
          setRunCompleted(true);
          trackRunEnd('workout_completed', {
            workout_id: workout.id,
            workout_name: workout.name,
            total_duration_ms: next.totalElapsedMs,
          }, true);
        } else {
          // New interval started — voice cue for the current interval only
          markIntervalStart();
          const cueCtx = buildVerboseCueContext(next, 'intervalStart', settingsRef.current);
          playCue('intervalStart', settingsRef.current.audioCueMode, cueCtx);
          if (settingsRef.current.hapticEnabled) hapticIntervalChange();
          firedWarnings.current.clear();
          firedCountdowns.current.clear();

          updateLiveActivity(buildLAProps(next, false));
          lastLAUpdate.current = Date.now();
          lastLAIndex.current = next.currentIndex;
        }
      } else {
        // ── Distance-based interval completion ──
        const ci_dist = currentInterval(s);
        if (ci_dist && isDistanceInterval(ci_dist)) {
          const ps = paceTrackerRef.current.getPaceState();
          const intervalDist = ps.totalDistanceMeters - intervalStartDistanceRef.current;
          if (intervalDist >= ci_dist.distanceMeters!) {
            captureSplit(s);
            let next = advanceInterval(s);
            engineRef.current = next;
            setEngine(next);
            if (next.phase === 'finished') {
              playCue('workoutComplete', settingsRef.current.audioCueMode, {});
              if (settingsRef.current.hapticEnabled) hapticWorkoutComplete();
              stopBackgroundLoop();
              endLiveActivity();
              stopSensors();
              saveHistoryEntry(next.totalElapsedMs);
              setRunCompleted(true);
              trackRunEnd('workout_completed', {
                workout_id: workout.id,
                workout_name: workout.name,
                total_duration_ms: next.totalElapsedMs,
              }, true);
            } else {
              markIntervalStart();
              const cueCtx = buildVerboseCueContext(next, 'intervalStart', settingsRef.current);
              playCue('intervalStart', settingsRef.current.audioCueMode, cueCtx);
              if (settingsRef.current.hapticEnabled) hapticIntervalChange();
              firedWarnings.current.clear();
              firedCountdowns.current.clear();
              updateLiveActivity(buildLAProps(next, false));
              lastLAUpdate.current = Date.now();
              lastLAIndex.current = next.currentIndex;
            }
          }
        }

        // ── Workout-level distance target ──
        if (
          workout.targetDistanceMeters &&
          paceTrackerRef.current.getPaceState().totalDistanceMeters >= workout.targetDistanceMeters &&
          s.phase === 'running'
        ) {
          captureSplit(s);
          const finished = finishWorkout(s);
          engineRef.current = finished;
          setEngine(finished);
          playCue('workoutComplete', settingsRef.current.audioCueMode, {});
          if (settingsRef.current.hapticEnabled) hapticWorkoutComplete();
          stopBackgroundLoop();
          endLiveActivity();
          stopSensors();
          saveHistoryEntry(finished.totalElapsedMs);
          setRunCompleted(true);
          trackRunEnd('workout_completed', {
            workout_id: workout.id,
            workout_name: workout.name,
            total_duration_ms: finished.totalElapsedMs,
          }, true);
        }

        // Periodic progress and pace cues. Skip the tick that just ended an interval
        // or the workout, so a split announcement doesn't talk over the transition.
        const secs = remainingSeconds(s);
        const ci = currentInterval(s);
        const warnSecsArr = settingsRef.current.countdownWarningSeconds;
        const maxWarn = warnSecsArr.length > 0 ? Math.max(...warnSecsArr) : 0;

        if (engineRef.current === s && ci) {
          const settingsNow = settingsRef.current;
          const timeBased = !isDistanceInterval(ci) && ci.durationSeconds > 0;
          const suppressTimeCues = timeBased && secs <= maxWarn;
          const elapsedSec = timeBased
            ? Math.max(0, ci.durationSeconds - secs)
            : Math.floor(intervalElapsedMsRef.current / 1000);
          const intervalDist =
            paceTrackerRef.current.getPaceState().totalDistanceMeters - intervalStartDistanceRef.current;
          const phrases: CuePhrase[] = [];
          const textPhrase = (text: string): CuePhrase => ({ clips: [text], text });

          const progressBasis = settingsNow.progressCueBasis;
          if (progressBasis === 'auto' && isDistanceInterval(ci)) {
            const step = cueDistanceMeters(settingsNow.progressCueDistance, settingsNow.paceUnit);
            const mark = nextCueMark(intervalDist, step, lastProgressMark.current);
            if (mark != null) {
              lastProgressMark.current = mark;
              phrases.push(
                distanceSplitCue(mark * step, elapsedSec, settingsNow.paceUnit, ci.distanceMeters),
              );
            }
          } else if (progressBasis === 'distance') {
            const step = cueDistanceMeters(settingsNow.progressCueDistance, settingsNow.paceUnit);
            const mark = nextCueMark(intervalDist, step, lastProgressMark.current);
            if (mark != null) {
              lastProgressMark.current = mark;
              phrases.push(textPhrase(distanceProgressPhrase(mark * step, settingsNow.paceUnit)));
            }
          } else if (!suppressTimeCues && settingsNow.timeRemainingInterval > 0) {
            const step = settingsNow.timeRemainingInterval;
            const mark = nextCueMark(elapsedSec, step, lastProgressMark.current);
            if (mark != null) {
              lastProgressMark.current = mark;
              phrases.push(intervalProgressCue(mark * step));
            }
          }

          const wantPace =
            settingsNow.paceTrackingEnabled &&
            (!settingsNow.paceCueOnlyWithTarget || ci.targetPace != null);
          const currentPaceCue = () => {
            const tracker = paceTrackerRef.current;
            const ps = tracker.getPaceState();
            const currentPace =
              settingsNow.paceUnit === 'minPerMile'
                ? ps.currentPaceMinPerMile
                : ps.currentPaceMinPerKm;
            return paceCue(currentPace, settingsNow.paceUnit, !tracker.hasHadPace());
          };
          if (wantPace) {
            const paceBasis = settingsNow.paceCueBasis;
            if (
              paceBasis === 'distance' ||
              (paceBasis === 'auto' && isDistanceInterval(ci))
            ) {
              const step = cueDistanceMeters(settingsNow.paceCueDistance, settingsNow.paceUnit);
              const mark = nextCueMark(intervalDist, step, lastPaceMark.current);
              if (mark != null) {
                lastPaceMark.current = mark;
                phrases.push(currentPaceCue());
              }
            } else if (!suppressTimeCues && settingsNow.paceCueFrequency > 0) {
              const step = settingsNow.paceCueFrequency;
              const mark = nextCueMark(elapsedSec, step, lastPaceMark.current);
              if (mark != null) {
                lastPaceMark.current = mark;
                phrases.push(currentPaceCue());
              }
            }
          }

          if (phrases.length > 0) {
            speakCuePhrases(phrases, settingsNow.audioCueMode);
          }
        }

        // Fire warning cues at each selected countdown threshold
        const newlyTriggered = warnSecsArr.filter(
          (w) => secs <= w && secs > 3 && !firedWarnings.current.has(w),
        );
        if (newlyTriggered.length > 0) {
          newlyTriggered.forEach((w) => firedWarnings.current.add(w));
          // Announce the most relevant (closest to now) warning
          const closest = Math.min(...newlyTriggered);
          const warnCtx = buildVerboseCueContext(s, 'warning', settingsRef.current);
          warnCtx.warningSeconds = closest;
          playCue('warning', settingsRef.current.audioCueMode, warnCtx);
          if (settingsRef.current.hapticEnabled) hapticWarning();
        }

        // 3-2-1 countdown beeps
        if (secs <= 3 && secs >= 1 && !firedCountdowns.current.has(secs)) {
          firedCountdowns.current.add(secs);
          playCue('countdown', settingsRef.current.audioCueMode);
          if (settingsRef.current.hapticEnabled) hapticCountdown();
        }

        // Periodic Live Activity refresh
        const now = Date.now();
        if (now - lastLAUpdate.current >= 10000) {
          updateLiveActivity(buildLAProps(s, false));
          lastLAUpdate.current = now;
        }

        if (now - lastSessionSaveAtRef.current >= SESSION_SAVE_INTERVAL_MS) {
          persistSession();
        }
      }

      setTick((t) => t + 1);
    }
  }, [workout.id, workout.name, buildLAProps, captureSplit, markIntervalStart, saveHistoryEntry, trackRunEnd, persistSession]);

  // Start/stop the tick loop based on engine phase.
  // Uses setInterval instead of requestAnimationFrame so ticks continue
  // when the app is backgrounded or the screen is locked.
  useEffect(() => {
    if (engine.phase === 'running') {
      intervalId.current = setInterval(tick, 200);
    }
    return () => {
      if (intervalId.current !== null) {
        clearInterval(intervalId.current);
        intervalId.current = null;
      }
    };
  }, [engine.phase, tick]);

  // When the app returns to foreground, immediately run a tick so the
  // Live Activity and UI catch up with any intervals that elapsed while
  // the JS timer was throttled in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && engineRef.current.phase === 'running') {
        tick();
      }
    });
    return () => sub.remove();
  }, [tick]);

  // Count how often and how long the app is backgrounded during a workout.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const phase = engineRef.current.phase;
      const inWorkout = phase === 'running' || phase === 'paused';
      if (nextState === 'background' && inWorkout && backgroundedAtRef.current == null) {
        backgroundCountRef.current += 1;
        backgroundedAtRef.current = Date.now();
      } else if (nextState === 'active' && backgroundedAtRef.current != null) {
        backgroundMsRef.current += Date.now() - backgroundedAtRef.current;
        backgroundedAtRef.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  // Ensure audio is configured and voice is set
  useEffect(() => {
    configureAudio();
    setDuckingEnabled(settings.duckOtherAudio);
    setVoiceIdentifier(settings.voiceIdentifier);
    setPremiumVoice(settings.voiceEngine === 'premium' ? settings.premiumVoiceId : null);
  }, [settings.voiceIdentifier, settings.duckOtherAudio, settings.voiceEngine, settings.premiumVoiceId]);

  // Keep the Android workout session (foreground service) up while the
  // workout is running or paused, so cues keep firing with the screen locked.
  const inWorkout = engine.phase === 'running' || engine.phase === 'paused';
  useEffect(() => {
    if (!inWorkout) return;
    const usesLocation = usesGpsRef.current;
    startWorkoutSession({
      title: workout.name || 'Workout in progress',
      body: usesLocation
        ? 'Tracking your running pace and playing audio cues'
        : 'Playing your workout audio cues',
      usesLocation,
    });
    return () => stopWorkoutSession(SESSION_END_GRACE_MS);
  }, [inWorkout, workout.name]);

  // Pick a restored workout back up: GPS, background audio and the Live Activity.
  // Declared before the save effect so the restored track is in place before it's re-saved.
  useEffect(() => {
    if (!resumeFrom) return;
    const tracker = paceTrackerRef.current;
    tracker.restore(resumeFrom.totalDistanceMeters, resumeFrom.trackSegments);
    if (resumeFrom.usesGps) tracker.start();
    heartRateRef.current.restore(resumeFrom.hrSamples ?? []);
    heartRateRef.current.start();
    startBackgroundLoop();
    startLiveActivity(buildLAProps(engineRef.current, true), workout.id);
    lastLAUpdate.current = Date.now();
    lastLAIndex.current = engineRef.current.currentIndex;
    track('workout_resumed_after_close', {
      workout_id: workout.id,
      workout_name: workout.name,
      interval_index: engineRef.current.currentIndex,
      closed_ms: Math.max(0, Date.now() - resumeFrom.savedAt),
    });
    // Mount only: the snapshot is consumed once.
  }, []);

  // Save on every phase or interval change. The saved session is kept after the workout ends
  // until it's in history, so a crash while finishing can still be resumed.
  useEffect(() => {
    persistSession();
  }, [engine.phase, engine.currentIndex, persistSession]);

  // Save when backgrounded, since the OS may kill the app without warning.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') persistSession();
    });
    return () => sub.remove();
  }, [persistSession]);

  // Clean up Live Activity and background loop on unmount
  useEffect(() => {
    return () => {
      stopBackgroundLoop();
      endLiveActivity();
    };
  }, []);

  // Controls
  const start = useCallback(() => {
    const next = startWorkout(engineRef.current);
    engineRef.current = next;
    setEngine(next);
    historySaved.current = false;
    splitsRef.current = [];
    firedWarnings.current.clear();
    firedCountdowns.current.clear();
    lastIndex.current = 0;
    batteryAtStartRef.current = null;
    pausedMsRef.current = 0;
    pausedAtRef.current = null;
    backgroundCountRef.current = 0;
    backgroundMsRef.current = 0;
    backgroundedAtRef.current = null;
    pauseCountRef.current = 0;
    skipCountRef.current = 0;
    settingsOpenedCountRef.current = 0;
    midRunSettingsChangedRef.current = new Set();
    const startCueCtx = buildVerboseCueContext(next, 'intervalStart', settingsRef.current);
    playCue('intervalStart', settingsRef.current.audioCueMode, startCueCtx);
    if (settingsRef.current.hapticEnabled) hapticIntervalChange();

    // Start pace tracking if enabled, for distance workouts, or when cues are by distance
    const needsGps =
      settingsRef.current.paceTrackingEnabled ||
      hasDistanceFeature(workout) ||
      distanceProgressCuesNeedGps(settingsRef.current);
    usesGpsRef.current = needsGps;
    if (needsGps) {
      paceTrackerRef.current.reset();
      paceTrackerRef.current.start();
    }
    heartRateRef.current.reset();
    heartRateRef.current.start().then(() => {
      if (heartRateRef.current.getDeviceName() == null) return;
      trackHr('hr_workout_started', { connected_at_start: getHrConnection() === 'connected' });
    });

    // Mark first interval start for split tracking
    intervalStartElapsedRef.current = 0;
    markIntervalStart();

    // Start silent background loop and Live Activity
    startBackgroundLoop();
    startLiveActivity(buildLAProps(next, false), workout.id);
    lastLAUpdate.current = Date.now();
    lastLAIndex.current = 0;

    const workoutContext = buildWorkoutContext(workout, settingsRef.current, sessionMeta);
    const startProps = {
      workout_id: workout.id,
      workout_name: workout.name,
      interval_count: next.intervals.length,
      total_duration_seconds: estimatedPlannedSeconds(next.intervals),
      gps_enabled: needsGps,
      settings: settingsRef.current,
      template_id: sessionMeta?.templateId,
      plan_workout_id: sessionMeta?.planWorkoutId,
      ...workoutContext,
    };
    Promise.all([getPowerSnapshot(), runHistoryRef.current!]).then(([power, history]) => {
      batteryAtStartRef.current = power.batteryLevel;
      track('workout_started', {
        ...startProps,
        ...history,
        battery_level: power.batteryLevel,
        charging: power.charging,
        low_power_mode: power.lowPowerMode,
      });
    });
    takeRestartContext(workout.name, workoutContext, settingsRef.current).then((restart) => {
      if (restart) {
        track('workout_restarted', {
          workout_id: workout.id,
          workout_name: workout.name,
          ...workoutContext,
          ...restart,
        });
      }
    });
  }, [buildLAProps, markIntervalStart, sessionMeta]);

  const pause = useCallback(() => {
    lastRunningTickAtRef.current = 0;
    const next = pauseWorkout(engineRef.current);
    engineRef.current = next;
    setEngine(next);
    if (next.phase === 'paused') {
      pausedAtRef.current = Date.now();
      pauseCountRef.current += 1;
      paceTrackerRef.current.pause();
      heartRateRef.current.pause();
    }

    // Update Live Activity to show paused state
    updateLiveActivity(buildLAProps(next, true));
  }, [buildLAProps]);

  const resume_ = useCallback(() => {
    const next = resumeWorkout(engineRef.current);
    engineRef.current = next;
    setEngine(next);
    if (pausedAtRef.current != null) {
      pausedMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    paceTrackerRef.current.resume();
    heartRateRef.current.resume();

    // Update Live Activity with new timing
    updateLiveActivity(buildLAProps(next, false));
    lastLAUpdate.current = Date.now();
  }, [buildLAProps]);

  const skip_ = useCallback(() => {
    // Capture split for the interval being skipped
    captureSplit(engineRef.current);

    const next = skipInterval(engineRef.current);
    engineRef.current = next;
    setEngine(next);
    if (next.phase !== 'finished') {
      skipCountRef.current += 1;
      firedWarnings.current.clear();
      firedCountdowns.current.clear();
      markIntervalStart();
      const skipCueCtx = buildVerboseCueContext(next, 'intervalStart', settingsRef.current);
      playCue('intervalStart', settingsRef.current.audioCueMode, skipCueCtx);
      if (settingsRef.current.hapticEnabled) hapticIntervalChange();

      // Update Live Activity immediately on skip
      updateLiveActivity(buildLAProps(next, false));
      lastLAUpdate.current = Date.now();
      lastLAIndex.current = next.currentIndex;
    } else {
      playCue('workoutComplete', settingsRef.current.audioCueMode, {});
      if (settingsRef.current.hapticEnabled) hapticWorkoutComplete();
      stopBackgroundLoop();
      endLiveActivity();
      stopSensors();
      saveHistoryEntry(next.totalElapsedMs);
      setRunCompleted(true);
      trackRunEnd('workout_completed', {
        workout_id: workout.id,
        workout_name: workout.name,
        total_duration_ms: next.totalElapsedMs,
      }, true);
    }
  }, [workout.id, workout.name, buildLAProps, captureSplit, markIntervalStart, saveHistoryEntry, trackRunEnd]);

  const stop_ = useCallback(() => {
    // Capture split for the interval in progress when stopped
    captureSplit(engineRef.current);

    const next = stopWorkout(engineRef.current);
    engineRef.current = next;
    setEngine(next);
    stopBackgroundLoop();
    endLiveActivity();
    stopSensors();

    // Save partial workout to history
    if (next.totalElapsedMs > 0) {
      saveHistoryEntry(next.totalElapsedMs, false);
      if (onlyCooldownRemains(next.intervals, next.currentIndex)) setRunCompleted(true);

      const plannedMs = estimatedPlannedSeconds(next.intervals) * 1000;
      const qualifies = runQualifies(next.totalElapsedMs, plannedMs);
      trackRunEnd('workout_abandoned', {
        workout_id: workout.id,
        workout_name: workout.name,
        elapsed_ms: next.totalElapsedMs,
        completion_pct: plannedMs > 0
          ? Math.round((next.totalElapsedMs / plannedMs) * 100)
          : 0,
      }, qualifies);
      if (!qualifies) {
        rememberFalseStart({
          stoppedAt: Date.now(),
          elapsedMs: next.totalElapsedMs,
          ended: 'stopped',
          workoutName: workout.name,
          workoutContext: buildWorkoutContext(workout, settingsRef.current, sessionMetaRef.current),
          settings: settingsRef.current,
        });
      }
    } else {
      clearActiveSession();
    }
  }, [workout, captureSplit, saveHistoryEntry, trackRunEnd]);

  const discard = useCallback(() => {
    const s = engineRef.current;
    const elapsedMs =
      s.startedAt > 0
        ? Math.max(0, (pausedAtRef.current ?? Date.now()) - s.startedAt - pausedMsRef.current)
        : 0;
    stopBackgroundLoop();
    endLiveActivity();
    stopSensors();

    trackRunEnd('workout_discarded', {
      workout_id: workout.id,
      workout_name: workout.name,
      elapsed_ms: elapsedMs,
      interval_index: s.currentIndex,
      was_paused: s.phase === 'paused',
    }, false);
    rememberFalseStart({
      stoppedAt: Date.now(),
      elapsedMs,
      ended: 'discarded',
      workoutName: workout.name,
      workoutContext: buildWorkoutContext(workout, settingsRef.current, sessionMetaRef.current),
      settings: settingsRef.current,
    });

    const fresh = createEngineState(workout);
    engineRef.current = fresh;
    setEngine(fresh);
    clearActiveSession();
  }, [workout, trackRunEnd]);

  const noteSettingsOpened = useCallback(() => {
    settingsOpenedCountRef.current += 1;
  }, []);

  // Derived display values
  const ci = currentInterval(engine);
  const ni = nextInterval(engine);

  // Distance tracking derivations
  const ciIsDistance = !!(ci && isDistanceInterval(ci));
  const intervalDistRemaining = ciIsDistance
    ? Math.max(0, ci!.distanceMeters! - (paceTracker.paceState.totalDistanceMeters - intervalStartDistanceRef.current))
    : null;
  const intervalDistProgress = ciIsDistance && ci!.distanceMeters! > 0
    ? Math.min(1, Math.max(0, (paceTracker.paceState.totalDistanceMeters - intervalStartDistanceRef.current) / ci!.distanceMeters!))
    : 0;
  const ciIntervalMs = ci && isUntimedInterval(ci) ? DISTANCE_INTERVAL_MAX_MS : (ci?.durationSeconds ?? 0) * 1000;
  const inProgress = engine.phase === 'running' || engine.phase === 'paused';
  const intervalElapsedMs = inProgress ? ciIntervalMs - remainingMs(engine) : 0;
  const wkTargetDist = workout.targetDistanceMeters ?? null;
  const wkDistRemaining = wkTargetDist
    ? Math.max(0, wkTargetDist - paceTracker.paceState.totalDistanceMeters)
    : null;

  return {
    state: engine,
    remaining: remainingSeconds(engine),
    remainingMillis: remainingMs(engine),
    progress: ciIsDistance ? intervalDistProgress : intervalProgress(engine),
    totalRemaining: totalRemainingSeconds(engine),
    elapsedSeconds:
      engine.startedAt > 0
        ? Math.max(
            0,
            Math.floor(
              ((pausedAtRef.current ?? Date.now()) - engine.startedAt - pausedMsRef.current) / 1000,
            ),
          )
        : 0,
    currentLabel: ci?.label || '',
    currentType: ci?.type || 'easy',
    nextLabel: ni?.label || null,
    intervalNumber:
      engine.intervals.length > 0
        ? `${engine.currentIndex + 1} / ${engine.intervals.length}`
        : '',

    // Pace tracking
    paceState: paceTracker.paceState,
    isPaceTracking: paceTracker.isTracking,

    heartRate: heartRate.deviceName != null
      ? { bpm: heartRate.currentBpm, connection: heartRate.connection }
      : null,

    completedEntryId,
    completedRoute,
    completedSplits,
    completedHeartRate,
    runCompleted,

    // Distance tracking
    isDistanceInterval: ciIsDistance,
    intervalDistanceRemaining: intervalDistRemaining,
    intervalDistanceProgress: intervalDistProgress,
    workoutDistanceTarget: wkTargetDist,
    workoutDistanceRemaining: wkDistRemaining,

    isOpenEnded: !!ci?.openEnded,
    intervalElapsedSeconds: Math.max(0, Math.floor(intervalElapsedMs / 1000)),

    start,
    pause,
    resume: resume_,
    skip: skip_,
    stop: stop_,
    discard,
    noteSettingsOpened,
  };
}
