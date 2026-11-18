/**
 * Picks a sensible next run after a finished one, using simple rules.
 * It's a nudge toward consistency, not a training prescription: nothing
 * here claims to know how recovered the runner is.
 *
 * When the runner has an active plan, it shows the next planned workout
 * instead of a generic suggestion.
 */

import {
  type AppSettings,
  type WorkoutDefinition,
  categorizeWorkout,
  createSegment,
  flattenWorkout,
  generateId,
} from './workoutTypes';
import type { PlanWorkout } from '../types/database';

/** Days between the run just finished and the suggested one (no-plan fallback). */
const DAYS_OUT = 2;

export interface NextRunSuggestion {
  workout: WorkoutDefinition;
  /** Local date, YYYY-MM-DD. */
  dateKey: string;
  daysOut: number;
  /** Why this run, in one sentence. */
  reason: string;
  /** One feature the runner hasn't tried yet, if any. */
  tip: string | null;
  /** When true, this suggestion comes from an existing plan workout (not a new run). */
  fromPlan?: boolean;
  /** The plan_workout id when the suggestion comes from the plan. */
  planWorkoutId?: string;
}

function localDateKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
}

/** Easy run about 80% as long as the run just done, 20–45 minutes, in 5-minute steps. */
function easyRun(actualMs: number): WorkoutDefinition {
  const minutes = Math.min(45, Math.max(20, Math.round((actualMs / 60000) * 0.8 / 5) * 5));
  const now = Date.now();
  return {
    id: generateId(),
    name: `Easy ${minutes}-Minute Run`,
    category: 'easy',
    origin: 'next_run_suggestion',
    blocks: [
      createSegment('run', {
        label: 'Easy Run',
        intensity: 'easy',
        effort: 3,
        target: { type: 'time', durationSeconds: minutes * 60 },
      }),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function featureTip(completed: WorkoutDefinition, settings: AppSettings): string | null {
  if (!settings.paceTrackingEnabled) {
    return 'Turn on pace tracking and SplitCue will call out your pace as you run, so you don\'t have to check your watch.';
  }
  if (settings.audioCueMode === 'silent' || settings.audioCueMode === 'beeps') {
    return 'Switch on voice cues and SplitCue will talk you through each interval.';
  }
  const hasTargetPace = flattenWorkout(completed).some((i) => i.targetPace != null);
  if (!hasTargetPace) {
    return 'Add a target pace to a workout and SplitCue will tell you when you drift off it.';
  }
  return null;
}

/**
 * When the runner has a plan, find the next planned (non-rest) workout and show it.
 * Returns null if there's nothing upcoming within 7 days.
 */
export function suggestNextPlannedRun(
  planWorkouts: PlanWorkout[],
  currentPlanWorkoutId: string | undefined,
  settings: AppSettings,
  completed: WorkoutDefinition,
): NextRunSuggestion | null {
  const todayStr = localDateKey(0);
  const next = planWorkouts
    .filter((pw) =>
      pw.status === 'planned' &&
      pw.id !== currentPlanWorkoutId &&
      pw.date >= todayStr &&
      !pw.day_label?.toLowerCase().includes('rest') &&
      !pw.day_label?.toLowerCase().includes('off'),
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (!next) return null;

  const daysOut = daysBetween(todayStr, next.date);
  if (daysOut > 7) return null;

  const workoutData = next.workout_data as WorkoutDefinition | null;
  const workout: WorkoutDefinition = workoutData
    ? { ...workoutData, id: workoutData.id || generateId() }
    : {
        id: generateId(),
        name: next.day_label || 'Training',
        category: 'easy',
        origin: 'plan',
        blocks: [
          createSegment('run', {
            label: next.day_label || 'Training',
            intensity: 'easy',
            effort: 4,
            target: { type: 'time', durationSeconds: 30 * 60 },
          }),
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

  return {
    workout,
    dateKey: next.date,
    daysOut,
    reason: next.description || `Your plan has ${next.day_label || 'a workout'} scheduled.`,
    tip: featureTip(completed, settings),
    fromPlan: true,
    planWorkoutId: next.id,
  };
}

/** Fallback for runners without a plan. */
export function suggestNextRun(
  completed: WorkoutDefinition,
  actualDurationMs: number,
  settings: AppSettings,
): NextRunSuggestion {
  const category = categorizeWorkout(completed);
  const hardDay = category === 'intervals' || category === 'tempo' || category === 'race' || category === 'long_run';

  const workout: WorkoutDefinition = hardDay
    ? easyRun(actualDurationMs)
    : {
        ...completed,
        id: generateId(),
        origin: 'next_run_suggestion',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

  return {
    workout,
    dateKey: localDateKey(DAYS_OUT),
    daysOut: DAYS_OUT,
    reason: hardDay
      ? 'An easy run a couple of days after a harder session keeps you consistent without overdoing it.'
      : 'Same run again in a couple of days. Consistency is what builds fitness.',
    tip: featureTip(completed, settings),
  };
}
