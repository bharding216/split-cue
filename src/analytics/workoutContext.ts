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
  flattenWorkout,
  totalWorkoutDistanceMeters,
} from '../workout/workoutTypes';
import { loadHistory } from '../workout/workoutStorage';
import type { SessionMeta } from '../hooks/useWorkoutRunner';
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
  const plannedSeconds = intervals.reduce((s, i) => s + i.durationSeconds, 0);
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
  const plannedMs = config
    ? flattenWorkout(config).reduce((s, i) => s + i.durationSeconds, 0) * 1000
    : 0;
  if (plannedMs > 0) return entry.totalDurationMs >= plannedMs * QUALIFYING_PLANNED_FRACTION;
  const plannedDistance = config ? totalWorkoutDistanceMeters(config) : null;
  if (plannedDistance && entry.totalDistanceMeters) {
    return entry.totalDistanceMeters >= plannedDistance * QUALIFYING_PLANNED_FRACTION;
  }
  return entry.totalDurationMs >= QUALIFYING_OPEN_RUN_MS;
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
