/**
 * Workout context attached to run analytics events, so the admin dashboard
 * can see what kind of run someone did and how they got to it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type AppSettings,
  type CompletedWorkout,
  type WorkoutDefinition,
  categorizeWorkout,
  estimatedPlannedSeconds,
  flattenWorkout,
  totalWorkoutDistanceMeters,
} from '../workout/workoutTypes';
import { loadHistory } from '../workout/workoutStorage';
import type { SessionMeta } from '../hooks/useWorkoutRunner';
import type { ActiveSessionSnapshot } from '../workout/activeSession';
import type { WorkoutSource } from '../workout/tempWorkoutCache';

/** A stopped run counts as done once this share of its planned time is covered. */
export const QUALIFYING_PLANNED_FRACTION = 0.5;
/** A stopped run with no planned time counts as done after this long. */
export const QUALIFYING_OPEN_RUN_MS = 10 * 60 * 1000;

const FIRST_RUN_TRACKED_KEY = '@pacecue/first_run_tracked';

/** How the run was launched, inferred from the session when the caller didn't say. */
export function resolveWorkoutSource(meta?: SessionMeta): WorkoutSource | 'unknown' {
  if (meta?.source) return meta.source;
  if (meta?.planWorkoutId) return 'calendar';
  if (meta?.quickStartType) return 'quick_start';
  if (meta?.templateId) return 'saved_template';
  return 'unknown';
}

/** Source for a calendar workout: AI training plans vs. the runner's own calendar. */
export function planWorkoutSource(plan?: { race_type: string } | null): WorkoutSource {
  return plan && plan.race_type !== 'custom' ? 'ai_plan' : 'calendar';
}

export function buildWorkoutContext(
  workout: WorkoutDefinition,
  settings: AppSettings,
  meta?: SessionMeta,
): Record<string, unknown> {
  const intervals = flattenWorkout(workout);
  const plannedSeconds = estimatedPlannedSeconds(intervals);
  const runSegments = intervals.filter((i) => i.segmentType === 'run');
  return {
    workout_source: resolveWorkoutSource(meta),
    workout_origin: workout.origin ?? 'manual',
    workout_category: categorizeWorkout(workout),
    quick_start_type: meta?.quickStartType,
    interval_count: intervals.length,
    planned_duration_s: plannedSeconds,
    planned_distance_m: totalWorkoutDistanceMeters(workout),
    has_target_pace: intervals.some((i) => i.targetPace != null),
    is_structured: runSegments.length > 1 || intervals.length > 3,
    audio_cue_mode: settings.audioCueMode,
    voice_engine: settings.voiceEngine,
    pace_tracking_enabled: settings.paceTrackingEnabled,
  };
}

export interface RunHistoryContext {
  prior_run_count: number;
  is_first_run: boolean;
  days_since_last_run: number | null;
}

/**
 * Whether a saved history entry counts as a real run. History doesn't record
 * whether a run was stopped early, so this uses how much of the plan was covered.
 */
export function historyEntryQualifies(entry: CompletedWorkout): boolean {
  const config = entry.configuration;
  const plannedDistance = config ? totalWorkoutDistanceMeters(config) : null;
  if (
    plannedDistance &&
    entry.totalDistanceMeters &&
    entry.totalDistanceMeters >= plannedDistance * QUALIFYING_PLANNED_FRACTION
  ) {
    return true;
  }
  const plannedMs = config ? estimatedPlannedSeconds(flattenWorkout(config)) * 1000 : 0;
  return runQualifies(entry.totalDurationMs, plannedMs);
}

/** Qualifying runs saved on this device, newest first. */
export async function loadQualifyingHistory(): Promise<CompletedWorkout[]> {
  try {
    const history = await loadHistory();
    return history.filter(historyEntryQualifies);
  } catch {
    return [];
  }
}

export async function getRunHistoryContext(): Promise<RunHistoryContext> {
  const runs = await loadQualifyingHistory();
  const last = runs[0];
  return {
    prior_run_count: runs.length,
    is_first_run: runs.length === 0,
    days_since_last_run: last
      ? Math.round(((Date.now() - last.completedAt) / 86_400_000) * 10) / 10
      : null,
  };
}

/** Whether a run stopped early still counts as a completed run. */
export function runQualifies(elapsedMs: number, plannedMs: number): boolean {
  if (plannedMs > 0) return elapsedMs >= plannedMs * QUALIFYING_PLANNED_FRACTION;
  return elapsedMs >= QUALIFYING_OPEN_RUN_MS;
}

/**
 * Describes a workout the app closed during, from the snapshot left behind.
 * `seconds_since_save` bounds when the app died: snapshots are written every
 * few seconds while running and on every move to the background.
 */
export function orphanedSessionProps(
  snapshot: ActiveSessionSnapshot,
  now = Date.now(),
): Record<string, unknown> {
  const { engine, workout } = snapshot;
  const endedAt = engine.phase === 'paused' && snapshot.pausedAt != null ? snapshot.pausedAt : snapshot.savedAt;
  const elapsedMs = engine.startedAt > 0 ? Math.max(0, endedAt - engine.startedAt - snapshot.pausedMs) : 0;
  const plannedMs = estimatedPlannedSeconds(engine.intervals) * 1000;
  return {
    workout_id: workout.id,
    workout_name: workout.name,
    workout_source: resolveWorkoutSource(snapshot.sessionMeta),
    phase_at_save: engine.phase,
    app_state_at_save: snapshot.appState ?? 'unknown',
    elapsed_ms: elapsedMs,
    completion_pct: plannedMs > 0 ? Math.round((elapsedMs / plannedMs) * 100) : 0,
    interval_index: engine.currentIndex,
    interval_count: engine.intervals.length,
    distance_m: Math.round(snapshot.totalDistanceMeters),
    uses_gps: snapshot.usesGps,
    seconds_since_save: Math.round(Math.max(0, now - snapshot.savedAt) / 1000),
  };
}

/** Returns true the first time it's called on this device, so first_run_completed fires once. */
export async function markFirstRunTracked(): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(FIRST_RUN_TRACKED_KEY)) return false;
    await AsyncStorage.setItem(FIRST_RUN_TRACKED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
