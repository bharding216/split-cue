/**
 * The completed run as sent to the analyze-workout function.
 *
 * Only pace, distance and time go to the AI provider. Heart rate is left out:
 * using it for coaching needs its own disclosure and opt-in first.
 */

import type { CompletedWorkout } from '../workout/workoutTypes';
import type { WorkoutAnalysisInput } from './planService';

const FEEL_TAGS = new Set(['Strong', 'Good', 'OK', 'Tough']);

/** Extract the feel tag (Strong/Good/OK/Tough) from the run's tags array, if present. */
export function extractFeelTag(tags?: string[]): string | undefined {
  return tags?.find((t) => FEEL_TAGS.has(t));
}

export function buildCompletedWorkoutPayload(
  run: CompletedWorkout,
  feelTag?: string,
): WorkoutAnalysisInput['completed_workout'] {
  const distance = run.totalDistanceMeters ?? null;
  const averagePace = distance && distance > 0
    ? (run.totalDurationMs / 60_000) / (distance / 1609.344)
    : null;

  const splits = (run.splits ?? [])
    .filter((s) => s.avgPaceMinPerMile != null && isFinite(s.avgPaceMinPerMile) && s.distanceMeters)
    .map((s) => ({
      label: s.label,
      type: s.type,
      pace_min_per_mile: s.avgPaceMinPerMile!,
      distance_meters: s.distanceMeters!,
      target_pace: s.targetPace ?? null,
    }));

  return {
    name: run.workoutName,
    total_duration_ms: run.totalDurationMs,
    total_distance_meters: distance,
    splits: splits.length > 0 ? splits : undefined,
    average_pace_min_per_mile: averagePace,
    feel_tag: feelTag,
  };
}
