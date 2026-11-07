/**
 * Picks a sensible next run after a finished one, using simple rules.
 * It's a nudge toward consistency, not a training prescription: nothing
 * here claims to know how recovered the runner is.
 */

import {
  type AppSettings,
  type WorkoutDefinition,
  categorizeWorkout,
  createSegment,
  flattenWorkout,
  generateId,
} from './workoutTypes';

/** Days between the run just finished and the suggested one. */
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
}

function localDateKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
