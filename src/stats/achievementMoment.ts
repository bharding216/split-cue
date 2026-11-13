/**
 * The one achievement worth celebrating after a run, if any.
 *
 * Most runs aren't remarkable, so the celebration is gated: the run must be
 * at least five minutes, and it must set a personal record (from the second
 * run on), earn a silver or gold award, or earn a first-time award. Only one
 * is shown per run.
 */

import type { CompletedWorkout } from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import { formatDistance } from '../units/format';
import type { AchievementMoment } from '../sharing/shareText';
import type { AwardBadge, PersonalRecord } from './personalRecords';

export const MIN_CELEBRATION_RUN_MS = 5 * 60_000;

const TIER_RANK = { gold: 3, silver: 2, bronze: 1 } as const;
const MILESTONE_MESSAGE = "You're building something great. Keep showing up.";
const PR_MESSAGE = 'Your best yet. The work is paying off.';

export interface LifetimeTotals {
  workouts: number;
  distanceMeters: number;
}

function isCelebrated(award: AwardBadge): boolean {
  return award.tier !== 'bronze' || award.id.startsWith('first_');
}

/** The big number and label for an award, e.g. "20" / "Workouts Completed". */
function awardHeadline(award: AwardBadge): { value: string; label: string } {
  const count = award.id.match(/^count_(\d+)$/);
  if (count) return { value: count[1], label: 'Workouts Completed' };
  if (award.id === 'dist_marathon') return { value: '26.2', label: 'Miles Logged' };
  const miles = award.id.match(/^dist_(\d+)mi$/);
  if (miles) return { value: miles[1], label: 'Miles Logged' };
  const pace = award.id.match(/^pace_sub(\d+)$/);
  if (pace) return { value: `Sub-${pace[1]}`, label: 'Minute Mile' };
  switch (award.id) {
    case 'streak_4wk':
      return { value: '4', label: 'Week Streak' };
    case 'first_5k':
      return { value: '5K', label: 'Finisher' };
    case 'first_10k':
      return { value: '10K', label: 'Finisher' };
    case 'first_interval':
      return { value: '1st', label: 'Interval Workout' };
    case 'first_hills':
      return { value: '50+ ft', label: 'Hill Climber' };
    default:
      return { value: award.label, label: award.description };
  }
}

function totalsFor(totals: LifetimeTotals, unit: PaceUnit): AchievementMoment['totals'] {
  const list = [{ label: 'Workouts', value: totals.workouts.toLocaleString() }];
  if (totals.distanceMeters > 0) list.push({ label: 'Logged', value: formatDistance(totals.distanceMeters, unit) });
  return list;
}

export function pickAchievementMoment({
  records,
  awards,
  run,
  totals,
  unit,
}: {
  records: PersonalRecord[];
  awards: AwardBadge[];
  run: Pick<CompletedWorkout, 'totalDurationMs'>;
  totals: LifetimeTotals;
  unit: PaceUnit;
}): AchievementMoment | null {
  if (run.totalDurationMs < MIN_CELEBRATION_RUN_MS) return null;

  // Every record is "new" on a first run, so records only count after that.
  const record = totals.workouts > 1 ? records[0] : undefined;
  if (record) {
    return {
      id: record.category,
      kicker: 'New PR',
      label: record.label,
      value: record.displayValue,
      message:
        record.category === 'biggest_improvement'
          ? `${record.displayValue}${record.unit} than your last run of this workout.`
          : PR_MESSAGE,
      totals: totalsFor(totals, unit),
    };
  }

  const award = awards
    .filter(isCelebrated)
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])[0];
  if (!award) return null;
  const { value, label } = awardHeadline(award);
  return {
    id: award.id,
    kicker: 'Milestone',
    label,
    value,
    message: MILESTONE_MESSAGE,
    totals: totalsFor(totals, unit),
  };
}
