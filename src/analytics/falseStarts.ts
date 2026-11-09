/**
 * False starts: runs stopped before they count, then set up again. The last
 * one is remembered so the next start can report what the runner changed in
 * between, which shows what they had to fix before running.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings } from '../workout/workoutTypes';

/** Stopping a run sooner than this discards it instead of saving it. */
export const DISCARD_WINDOW_MS = 60_000;
/** A start this soon after a false start counts as a restart. */
const RESTART_WINDOW_MS = 15 * 60_000;

const LAST_FALSE_START_KEY = '@pacecue/last_false_start';

/** Workout context fields compared between a false start and its restart. */
const WORKOUT_FIELDS = [
  'workout_source',
  'quick_start_type',
  'workout_category',
  'interval_count',
  'planned_duration_s',
  'planned_distance_m',
  'has_target_pace',
] as const;

interface FalseStart {
  stoppedAt: number;
  elapsedMs: number;
  ended: 'discarded' | 'stopped';
  workoutName: string;
  workoutContext: Record<string, unknown>;
  settings: AppSettings;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function rememberFalseStart(falseStart: FalseStart): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_FALSE_START_KEY, JSON.stringify(falseStart));
  } catch {}
}

/**
 * If this run restarts a recent false start, what changed since then.
 * The false start is forgotten either way, so it's reported once.
 */
export async function takeRestartContext(
  workoutName: string,
  workoutContext: Record<string, unknown>,
  settings: AppSettings,
): Promise<Record<string, unknown> | null> {
  let previous: FalseStart;
  try {
    const raw = await AsyncStorage.getItem(LAST_FALSE_START_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(LAST_FALSE_START_KEY);
    previous = JSON.parse(raw);
  } catch {
    return null;
  }

  const sinceMs = Date.now() - previous.stoppedAt;
  if (sinceMs < 0 || sinceMs > RESTART_WINDOW_MS) return null;

  const workoutChanges = WORKOUT_FIELDS.filter(
    (k) => !same(previous.workoutContext[k], workoutContext[k]),
  );
  const settingKeys = (Object.keys(settings) as (keyof AppSettings)[]).filter(
    (k) => !same(previous.settings[k], settings[k]),
  );

  return {
    seconds_since_stop: Math.round(sinceMs / 1000),
    previous_elapsed_ms: previous.elapsedMs,
    previous_ended: previous.ended,
    same_workout_name: previous.workoutName === workoutName,
    workout_changes: workoutChanges,
    workout_changes_from: Object.fromEntries(workoutChanges.map((k) => [k, previous.workoutContext[k]])),
    settings_changes: settingKeys,
    settings_changes_from: Object.fromEntries(settingKeys.map((k) => [k, previous.settings[k]])),
    settings_changes_to: Object.fromEntries(settingKeys.map((k) => [k, settings[k]])),
  };
}
