/**
 * Persists the in-progress workout so it can be resumed if the app is
 * closed or killed mid-run.
 *
 * The runner writes a snapshot while a workout is running or paused and
 * deletes it when the workout finishes or is stopped. On the next launch,
 * a leftover snapshot means the workout never ended, so the user is
 * offered the chance to pick it back up.
 *
 * Stored as a file rather than in AsyncStorage: the GPS track of a long
 * run can exceed Android's ~2 MB per-entry read limit.
 */

import { File, Paths } from 'expo-file-system';
import type {
  EngineState,
  IntervalSplit,
  WorkoutDefinition,
} from './workoutTypes';
import type { GpsSample } from '../pace/paceTypes';
import type { SessionMeta } from '../hooks/useWorkoutRunner';

const SESSION_VERSION = 1;

/** Sessions older than this are dropped instead of offered for resume. */
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000;

export interface ActiveSessionSnapshot {
  version: typeof SESSION_VERSION;
  /** Epoch ms when the snapshot was written. */
  savedAt: number;
  workout: WorkoutDefinition;
  sessionMeta?: SessionMeta;
  engine: EngineState;
  /** Total time spent paused before `savedAt`. */
  pausedMs: number;
  /** When the current pause began, if paused. */
  pausedAt: number | null;
  splits: IntervalSplit[];
  intervalStartedAt: number;
  intervalStartDistance: number;
  intervalElapsedMs: number;
  usesGps: boolean;
  totalDistanceMeters: number;
  trackSegments: GpsSample[][];
}

/** Runner state rebuilt from a snapshot, always paused. */
export interface RestoredSession {
  engine: EngineState;
  pausedMs: number;
  pausedAt: number;
  intervalStartedAt: number;
}

function sessionFile(): File {
  return new File(Paths.document, 'active-workout.json');
}

export function saveActiveSession(
  session: Omit<ActiveSessionSnapshot, 'version' | 'savedAt'>,
): void {
  const snapshot: ActiveSessionSnapshot = {
    ...session,
    version: SESSION_VERSION,
    savedAt: Date.now(),
  };
  try {
    const file = sessionFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(snapshot));
  } catch (e) {
    console.warn('Failed to save active workout:', e);
  }
}

export function clearActiveSession(): void {
  try {
    const file = sessionFile();
    if (file.exists) file.delete();
  } catch (e) {
    console.warn('Failed to clear active workout:', e);
  }
}

/** The unfinished workout from a previous launch, or null. Drops stale or unreadable snapshots. */
export function loadActiveSession(): ActiveSessionSnapshot | null {
  try {
    const file = sessionFile();
    if (!file.exists) return null;
    const snapshot = JSON.parse(file.textSync()) as ActiveSessionSnapshot;
    const phase = snapshot?.engine?.phase;
    if (
      snapshot?.version !== SESSION_VERSION ||
      !snapshot.workout ||
      (phase !== 'running' && phase !== 'paused') ||
      Date.now() - snapshot.savedAt > MAX_SESSION_AGE_MS
    ) {
      clearActiveSession();
      return null;
    }
    return snapshot;
  } catch (e) {
    console.warn('Failed to load active workout:', e);
    clearActiveSession();
    return null;
  }
}

/**
 * Rebuild the runner's clock from a snapshot, paused at the moment it was
 * saved. The time the app was closed is shifted out of every timestamp, so
 * it counts toward neither elapsed time nor the current interval.
 */
export function restoreSession(snapshot: ActiveSessionSnapshot, now = Date.now()): RestoredSession {
  const gap = Math.max(0, now - snapshot.savedAt);
  const { engine } = snapshot;
  const wasPaused = engine.phase === 'paused';
  return {
    engine: {
      ...engine,
      phase: 'paused',
      startedAt: engine.startedAt + gap,
      pausedRemaining: wasPaused
        ? engine.pausedRemaining
        : Math.max(0, engine.intervalEndsAt - snapshot.savedAt),
    },
    pausedMs: snapshot.pausedMs,
    pausedAt: wasPaused && snapshot.pausedAt != null ? snapshot.pausedAt + gap : now,
    intervalStartedAt:
      snapshot.intervalStartedAt > 0 ? snapshot.intervalStartedAt + gap : 0,
  };
}
