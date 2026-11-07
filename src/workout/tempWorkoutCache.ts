/**
 * In-memory workout cache for passing plan workouts to the
 * run/edit screens without saving them to the local library.
 *
 * Plan-generated workouts live in Supabase `plan_workouts` — they
 * don't need to be duplicated into the on-device workout library.
 * This cache bridges the navigation gap: the plan detail screen
 * stashes the workout here, and the run/edit screen picks it up.
 *
 * Extended with session metadata so the configure → run flow
 * can carry templateId, planWorkoutId, and quickStartType through
 * without writing to the library.
 */

import type { WorkoutDefinition, QuickStartType } from './workoutTypes';

/** How the runner got to the run screen, for analytics. */
export type WorkoutSource =
  | 'quick_start'
  | 'recent_repeat'
  | 'recent_edit'
  | 'history_repeat'
  | 'saved_template'
  | 'calendar'
  | 'ai_plan'
  | 'reminder'
  | 'home_next_run';

/** Metadata that rides along with a cached workout draft. */
export interface TempWorkoutMeta {
  /** How the run was launched; see WorkoutSource. */
  source?: WorkoutSource;
  /** Library template id when editing/starting a saved workout. */
  templateId?: string;
  /** plan_workouts.id when starting from the training calendar. */
  planWorkoutId?: string;
  /** Which Quick Start tile produced this draft. */
  quickStartType?: QuickStartType;
}

interface CacheEntry {
  workout: WorkoutDefinition;
  meta: TempWorkoutMeta;
}

const cache = new Map<string, CacheEntry>();

/** Stash a workout so the run/edit screen can retrieve it by ID. */
export function setTempWorkout(workout: WorkoutDefinition, meta: TempWorkoutMeta = {}): void {
  cache.set(workout.id, { workout, meta });
}

/** Retrieve a cached workout (returns undefined if not cached). */
export function getTempWorkout(id: string): WorkoutDefinition | undefined {
  return cache.get(id)?.workout;
}

/** Retrieve only the metadata for a cached workout. */
export function getTempWorkoutMeta(id: string): TempWorkoutMeta | undefined {
  return cache.get(id)?.meta;
}

/** Remove a workout from the cache once it's no longer needed. */
export function clearTempWorkout(id: string): void {
  cache.delete(id);
}
