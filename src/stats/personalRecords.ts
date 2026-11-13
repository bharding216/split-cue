/**
 * Personal records and awards engine.
 *
 * Computes all-time PBs and milestone awards from workout history.
 * Pure functions — no side effects, no storage. The caller passes in
 * the full CompletedWorkout[] array and gets back computed stats.
 */

import type { CompletedWorkout, IntervalSplit, RoutePoint } from '../workout/workoutTypes';
import { analyzeElevation, aggregateByTerrain } from '../pace/elevationAnalysis';
import type { PaceUnit } from '../pace/paceTypes';
import { formatDistance, formatPaceValue, metersPerUnit, paceSuffix } from '../units/format';
import { computeIntervalConsistency } from './intervalConsistency';

const METERS_PER_MILE = 1_609.344;

// ── Record types ─────────────────────────────────────────────────────

export type RecordCategory =
  | 'fastest_mile'
  | 'fastest_5k'
  | 'fastest_10k'
  | 'fastest_half_marathon'
  | 'longest_run'
  | 'longest_duration'
  | 'best_avg_pace'
  | 'fastest_uphill_pace'
  | 'most_elevation_gain'
  | 'most_consistent_intervals'
  | 'biggest_improvement';

/** Records where a bigger value is better; the rest are times and paces. */
const HIGHER_IS_BETTER: readonly RecordCategory[] = [
  'longest_run',
  'longest_duration',
  'most_elevation_gain',
  'most_consistent_intervals',
  'biggest_improvement',
];

export interface PersonalRecord {
  category: RecordCategory;
  label: string;
  icon: string; // Ionicons name
  value: number; // raw value (min for pace/time, meters for distance)
  displayValue: string;
  unit: string;
  workoutId: string;
  workoutName: string;
  completedAt: number;
}

export interface AwardBadge {
  id: string;
  label: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  earnedAt: number; // epoch ms
}

export interface StatsSnapshot {
  records: PersonalRecord[];
  awards: AwardBadge[];
  /** Total lifetime distance in meters. */
  totalDistanceMeters: number;
  /** Total lifetime duration in ms. */
  totalDurationMs: number;
  /** Total completed workouts. */
  totalWorkouts: number;
  /** Pace trend data: { date, avgPace } for the ProgressChart. */
  paceTrend: TrendPoint[];
  /** Distance trend data: { date, distance } for the ProgressChart. */
  distanceTrend: TrendPoint[];
  /** Duration trend data. */
  durationTrend: TrendPoint[];
}

export interface TrendPoint {
  date: number; // epoch ms
  value: number;
}

// ── Pace helpers ─────────────────────────────────────────────────────

/** Estimate pace for a known distance from a workout's route data. */
function timeForDistance(
  route: RoutePoint[],
  targetMeters: number,
): number | null {
  if (!route || route.length < 2) return null;
  const totalDist = route[route.length - 1].dist;
  if (totalDist < targetMeters) return null;

  // Find the route point closest to the target distance
  for (let i = 1; i < route.length; i++) {
    if (route[i].dist >= targetMeters) {
      // Linear interpolation for accuracy
      const prev = route[i - 1];
      const overshoot = route[i].dist - targetMeters;
      const segDist = route[i].dist - prev.dist;
      const frac = segDist > 0 ? overshoot / segDist : 0;
      const timeMs = route[i].ts - route[0].ts;
      const prevTimeMs = prev.ts - route[0].ts;
      const interpolated = timeMs - frac * (timeMs - prevTimeMs);
      return interpolated;
    }
  }
  return null;
}

/** Average pace in min/mile for a completed workout. */
function avgPaceMinPerMile(w: CompletedWorkout): number | null {
  if (!w.totalDistanceMeters || w.totalDistanceMeters < METERS_PER_MILE * 0.5) {
    return null;
  }
  const secs = w.totalDurationMs / 1000;
  const mps = w.totalDistanceMeters / secs;
  if (mps < 0.3) return null;
  return METERS_PER_MILE / mps / 60;
}

// ── Format helpers ───────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatElevation(meters: number): string {
  const feet = Math.round(meters * 3.28084);
  return `${feet.toLocaleString()} ft`;
}

// ── Core computation ─────────────────────────────────────────────────

/** Build the full records list from workout history. Display strings use `unit`. */
function computeRecords(history: CompletedWorkout[], unit: PaceUnit): PersonalRecord[] {
  const records: PersonalRecord[] = [];

  // ── Fastest split times for standard distances ──
  const distanceTargets: {
    category: RecordCategory;
    label: string;
    meters: number;
    icon: string;
  }[] = [
    { category: 'fastest_mile', label: 'Fastest Mile', meters: METERS_PER_MILE, icon: 'flash-outline' },
    { category: 'fastest_5k', label: 'Fastest 5K', meters: 5000, icon: 'ribbon-outline' },
    { category: 'fastest_10k', label: 'Fastest 10K', meters: 10000, icon: 'medal-outline' },
    { category: 'fastest_half_marathon', label: 'Fastest Half Marathon', meters: 21097, icon: 'trophy-outline' },
  ];

  for (const target of distanceTargets) {
    let bestTimeMs: number | null = null;
    let bestWorkout: CompletedWorkout | null = null;

    for (const w of history) {
      if (!w.route || w.route.length < 2) continue;
      const time = timeForDistance(w.route, target.meters);
      if (time !== null && (bestTimeMs === null || time < bestTimeMs)) {
        bestTimeMs = time;
        bestWorkout = w;
      }
    }

    if (bestTimeMs !== null && bestWorkout) {
      records.push({
        category: target.category,
        label: target.label,
        icon: target.icon,
        value: bestTimeMs,
        displayValue: formatDuration(bestTimeMs),
        unit: '',
        workoutId: bestWorkout.workoutId,
        workoutName: bestWorkout.workoutName,
        completedAt: bestWorkout.completedAt,
      });
    }
  }

  // ── Longest run (by distance) ──
  let longestDist: CompletedWorkout | null = null;
  for (const w of history) {
    if (
      w.totalDistanceMeters &&
      w.totalDistanceMeters > 0 &&
      (!longestDist || w.totalDistanceMeters > (longestDist.totalDistanceMeters ?? 0))
    ) {
      longestDist = w;
    }
  }
  if (longestDist && longestDist.totalDistanceMeters) {
    records.push({
      category: 'longest_run',
      label: 'Longest Run',
      icon: 'map-outline',
      value: longestDist.totalDistanceMeters,
      displayValue: formatDistance(longestDist.totalDistanceMeters, unit),
      unit: '',
      workoutId: longestDist.workoutId,
      workoutName: longestDist.workoutName,
      completedAt: longestDist.completedAt,
    });
  }

  // ── Longest duration ──
  let longestDur: CompletedWorkout | null = null;
  for (const w of history) {
    if (!longestDur || w.totalDurationMs > longestDur.totalDurationMs) {
      longestDur = w;
    }
  }
  if (longestDur) {
    records.push({
      category: 'longest_duration',
      label: 'Longest Duration',
      icon: 'time-outline',
      value: longestDur.totalDurationMs,
      displayValue: formatDuration(longestDur.totalDurationMs),
      unit: '',
      workoutId: longestDur.workoutId,
      workoutName: longestDur.workoutName,
      completedAt: longestDur.completedAt,
    });
  }

  // ── Best average pace (runs >= 1 mile) ──
  let bestPace: { pace: number; workout: CompletedWorkout } | null = null;
  for (const w of history) {
    const pace = avgPaceMinPerMile(w);
    if (pace !== null && (!bestPace || pace < bestPace.pace)) {
      bestPace = { pace, workout: w };
    }
  }
  if (bestPace) {
    records.push({
      category: 'best_avg_pace',
      label: 'Best Average Pace',
      icon: 'speedometer-outline',
      value: bestPace.pace,
      displayValue: formatPaceValue(bestPace.pace, unit),
      unit: paceSuffix(unit),
      workoutId: bestPace.workout.workoutId,
      workoutName: bestPace.workout.workoutName,
      completedAt: bestPace.workout.completedAt,
    });
  }

  // ── Fastest uphill pace ──
  let bestUphill: { pace: number; workout: CompletedWorkout } | null = null;
  for (const w of history) {
    if (!w.route || w.route.length < 10) continue;
    const analysis = analyzeElevation(w.route);
    if (!analysis) continue;
    const aggs = aggregateByTerrain(analysis.segments);
    const uphill = aggs.find((a) => a.type === 'uphill');
    if (
      uphill?.avgPaceMinPerMile &&
      uphill.totalDistanceMeters > 100 &&
      (!bestUphill || uphill.avgPaceMinPerMile < bestUphill.pace)
    ) {
      bestUphill = { pace: uphill.avgPaceMinPerMile, workout: w };
    }
  }
  if (bestUphill) {
    records.push({
      category: 'fastest_uphill_pace',
      label: 'Fastest Hills Pace',
      icon: 'trending-up',
      value: bestUphill.pace,
      displayValue: formatPaceValue(bestUphill.pace, unit),
      unit: paceSuffix(unit),
      workoutId: bestUphill.workout.workoutId,
      workoutName: bestUphill.workout.workoutName,
      completedAt: bestUphill.workout.completedAt,
    });
  }

  // ── Most elevation gain ──
  let maxGain: { gain: number; workout: CompletedWorkout } | null = null;
  for (const w of history) {
    if (!w.route || w.route.length < 10) continue;
    const analysis = analyzeElevation(w.route);
    if (!analysis) continue;
    if (!maxGain || analysis.totalElevationGainMeters > maxGain.gain) {
      maxGain = { gain: analysis.totalElevationGainMeters, workout: w };
    }
  }
  if (maxGain) {
    records.push({
      category: 'most_elevation_gain',
      label: 'Most Elevation Gain',
      icon: 'arrow-up-outline',
      value: maxGain.gain,
      displayValue: formatElevation(maxGain.gain),
      unit: '',
      workoutId: maxGain.workout.workoutId,
      workoutName: maxGain.workout.workoutName,
      completedAt: maxGain.workout.completedAt,
    });
  }

  // ── Most consistent interval session ──
  let mostConsistent: { score: number; workout: CompletedWorkout } | null = null;
  for (const w of history) {
    const consistency = computeIntervalConsistency(w.splits);
    if (consistency && (!mostConsistent || consistency.score > mostConsistent.score)) {
      mostConsistent = { score: consistency.score, workout: w };
    }
  }
  if (mostConsistent) {
    records.push({
      category: 'most_consistent_intervals',
      label: 'Most Consistent Intervals',
      icon: 'pulse-outline',
      value: mostConsistent.score,
      displayValue: `${mostConsistent.score}`,
      unit: '/100',
      workoutId: mostConsistent.workout.workoutId,
      workoutName: mostConsistent.workout.workoutName,
      completedAt: mostConsistent.workout.completedAt,
    });
  }

  // ── Biggest improvement on a repeated workout (average pace vs the previous run of it) ──
  const lastPaceByWorkout = new Map<string, number>();
  let biggestGain: { secPerMile: number; workout: CompletedWorkout } | null = null;
  for (const w of [...history].sort((a, b) => a.completedAt - b.completedAt)) {
    const pace = avgPaceMinPerMile(w);
    if (pace === null) continue;
    const key = w.templateId ?? w.workoutId;
    const previous = lastPaceByWorkout.get(key);
    lastPaceByWorkout.set(key, pace);
    if (previous === undefined) continue;
    const gain = (previous - pace) * 60;
    if (gain >= 1 && (!biggestGain || gain > biggestGain.secPerMile)) {
      biggestGain = { secPerMile: gain, workout: w };
    }
  }
  if (biggestGain) {
    const gainInUnit = Math.round(biggestGain.secPerMile * (metersPerUnit(unit) / METERS_PER_MILE));
    records.push({
      category: 'biggest_improvement',
      label: 'Biggest Improvement',
      icon: 'trending-up-outline',
      value: biggestGain.secPerMile,
      displayValue: `${Math.floor(gainInUnit / 60)}:${String(gainInUnit % 60).padStart(2, '0')}`,
      unit: `${paceSuffix(unit)} faster`,
      workoutId: biggestGain.workout.workoutId,
      workoutName: biggestGain.workout.workoutName,
      completedAt: biggestGain.workout.completedAt,
    });
  }

  return records;
}

// ── Milestone awards ─────────────────────────────────────────────────

const DISTANCE_MILESTONES = [
  { miles: 10, label: '10 Miles', id: 'dist_10mi', tier: 'bronze' as const },
  { miles: 26.2, label: 'Marathon Distance', id: 'dist_marathon', tier: 'silver' as const },
  { miles: 50, label: '50 Miles', id: 'dist_50mi', tier: 'silver' as const },
  { miles: 100, label: '100 Miles', id: 'dist_100mi', tier: 'gold' as const },
  { miles: 250, label: '250 Miles', id: 'dist_250mi', tier: 'gold' as const },
  { miles: 500, label: '500 Miles', id: 'dist_500mi', tier: 'gold' as const },
];

const WORKOUT_COUNT_MILESTONES = [
  { count: 5, label: '5 Workouts', id: 'count_5', tier: 'bronze' as const },
  { count: 10, label: '10 Workouts', id: 'count_10', tier: 'bronze' as const },
  { count: 20, label: '20 Workouts', id: 'count_20', tier: 'silver' as const },
  { count: 25, label: '25 Workouts', id: 'count_25', tier: 'silver' as const },
  { count: 50, label: '50 Workouts', id: 'count_50', tier: 'silver' as const },
  { count: 100, label: '100 Workouts', id: 'count_100', tier: 'gold' as const },
];

const PACE_MILESTONES = [
  { pace: 12, label: 'Sub-12 Mile', id: 'pace_sub12', tier: 'bronze' as const },
  { pace: 10, label: 'Sub-10 Mile', id: 'pace_sub10', tier: 'bronze' as const },
  { pace: 9, label: 'Sub-9 Mile', id: 'pace_sub9', tier: 'silver' as const },
  { pace: 8, label: 'Sub-8 Mile', id: 'pace_sub8', tier: 'silver' as const },
  { pace: 7, label: 'Sub-7 Mile', id: 'pace_sub7', tier: 'gold' as const },
  { pace: 6, label: 'Sub-6 Mile', id: 'pace_sub6', tier: 'gold' as const },
];

const STREAK_WEEKS = 4;
const MS_PER_DAY = 86_400_000;

function workRepCount(splits: IntervalSplit[] | undefined): number {
  return (splits ?? []).filter((s) => (s.segmentType ? s.segmentType === 'run' : s.type === 'hard')).length;
}

/** Index of the local Monday-start week containing `ms`, counted from a fixed epoch. */
function weekIndex(ms: number): number {
  const d = new Date(ms);
  const daysSinceMonday = (d.getDay() + 6) % 7;
  // The local calendar date of that Monday, as a UTC day, so time zones and DST don't shift it.
  const monday = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - daysSinceMonday);
  return Math.floor(monday / (7 * MS_PER_DAY));
}

/** The run (oldest first) that first completed `weeks` consecutive weeks with a run. */
function firstWeekStreakRun(sorted: CompletedWorkout[], weeks: number): CompletedWorkout | null {
  let streak = 0;
  let lastWeek: number | null = null;
  for (const w of sorted) {
    const week = weekIndex(w.completedAt);
    if (week === lastWeek) continue;
    streak = lastWeek !== null && week === lastWeek + 1 ? streak + 1 : 1;
    lastWeek = week;
    if (streak >= weeks) return w;
  }
  return null;
}

function computeAwards(history: CompletedWorkout[]): AwardBadge[] {
  const awards: AwardBadge[] = [];
  const sorted = [...history].sort((a, b) => a.completedAt - b.completedAt);

  // ── Distance milestones (cumulative) ──
  let cumDist = 0;
  const distMilestonesHit = new Set<string>();
  for (const w of sorted) {
    cumDist += w.totalDistanceMeters ?? 0;
    const cumMiles = cumDist / METERS_PER_MILE;
    for (const ms of DISTANCE_MILESTONES) {
      if (cumMiles >= ms.miles && !distMilestonesHit.has(ms.id)) {
        distMilestonesHit.add(ms.id);
        awards.push({
          id: ms.id,
          label: ms.label,
          description: `Ran a total of ${ms.miles} miles`,
          icon: 'footsteps-outline',
          tier: ms.tier,
          earnedAt: w.completedAt,
        });
      }
    }
  }

  // ── Workout count milestones ──
  for (const ms of WORKOUT_COUNT_MILESTONES) {
    if (sorted.length >= ms.count) {
      awards.push({
        id: ms.id,
        label: ms.label,
        description: `Completed ${ms.count} workouts`,
        icon: 'fitness-outline',
        tier: ms.tier,
        earnedAt: sorted[ms.count - 1].completedAt,
      });
    }
  }

  // ── Pace milestones (fastest mile time) ──
  for (const w of sorted) {
    if (!w.route || w.route.length < 2) continue;
    const mileTimeMs = timeForDistance(w.route, METERS_PER_MILE);
    if (mileTimeMs === null) continue;
    const mileMinutes = mileTimeMs / 60000;
    for (const ms of PACE_MILESTONES) {
      if (mileMinutes < ms.pace && !awards.some((a) => a.id === ms.id)) {
        awards.push({
          id: ms.id,
          label: ms.label,
          description: `Ran a mile in under ${ms.pace} minutes`,
          icon: 'flash-outline',
          tier: ms.tier,
          earnedAt: w.completedAt,
        });
      }
    }
  }

  // ── Special awards ──
  const hasHillRun = sorted.some((w) => {
    if (!w.route || w.route.length < 10) return false;
    const analysis = analyzeElevation(w.route);
    return analysis && analysis.totalElevationGainMeters > 50;
  });
  if (hasHillRun) {
    const hillRun = sorted.find((w) => {
      if (!w.route || w.route.length < 10) return false;
      const analysis = analyzeElevation(w.route);
      return analysis && analysis.totalElevationGainMeters > 50;
    })!;
    awards.push({
      id: 'first_hills',
      label: 'Hill Climber',
      description: 'Completed a run with 50+ ft of elevation gain',
      icon: 'trending-up',
      tier: 'bronze',
      earnedAt: hillRun.completedAt,
    });
  }

  // 5K finisher
  const first5k = sorted.find((w) => {
    if (!w.route || w.route.length < 2) return false;
    return w.route[w.route.length - 1].dist >= 5000;
  });
  if (first5k) {
    awards.push({
      id: 'first_5k',
      label: '5K Finisher',
      description: 'Ran at least 5 kilometers in a single workout',
      icon: 'ribbon-outline',
      tier: 'bronze',
      earnedAt: first5k.completedAt,
    });
  }

  // 10K finisher
  const first10k = sorted.find((w) => {
    if (!w.route || w.route.length < 2) return false;
    return w.route[w.route.length - 1].dist >= 10000;
  });
  if (first10k) {
    awards.push({
      id: 'first_10k',
      label: '10K Finisher',
      description: 'Ran at least 10 kilometers in a single workout',
      icon: 'medal-outline',
      tier: 'silver',
      earnedAt: first10k.completedAt,
    });
  }

  // First interval workout: at least two work reps
  const firstInterval = sorted.find((w) => workRepCount(w.splits) >= 2);
  if (firstInterval) {
    awards.push({
      id: 'first_interval',
      label: 'First Intervals',
      description: 'Completed your first interval workout',
      icon: 'repeat-outline',
      tier: 'bronze',
      earnedAt: firstInterval.completedAt,
    });
  }

  // Four consecutive weeks with at least one run
  const streakRun = firstWeekStreakRun(sorted, STREAK_WEEKS);
  if (streakRun) {
    awards.push({
      id: 'streak_4wk',
      label: '4-Week Streak',
      description: `Ran at least once a week for ${STREAK_WEEKS} weeks in a row`,
      icon: 'calendar-outline',
      tier: 'silver',
      earnedAt: streakRun.completedAt,
    });
  }

  // Sort by earned date, newest first
  awards.sort((a, b) => b.earnedAt - a.earnedAt);

  return awards;
}

// ── Trend data ───────────────────────────────────────────────────────

function computePaceTrend(history: CompletedWorkout[]): TrendPoint[] {
  return history
    .filter((w) => {
      const pace = avgPaceMinPerMile(w);
      return pace !== null;
    })
    .map((w) => ({
      date: w.completedAt,
      value: avgPaceMinPerMile(w)!,
    }))
    .sort((a, b) => a.date - b.date);
}

function computeDistanceTrend(history: CompletedWorkout[]): TrendPoint[] {
  return history
    .filter((w) => w.totalDistanceMeters && w.totalDistanceMeters > 100)
    .map((w) => ({
      date: w.completedAt,
      value: w.totalDistanceMeters! / METERS_PER_MILE,
    }))
    .sort((a, b) => a.date - b.date);
}

function computeDurationTrend(history: CompletedWorkout[]): TrendPoint[] {
  return history
    .map((w) => ({
      date: w.completedAt,
      value: w.totalDurationMs / 60000, // minutes
    }))
    .sort((a, b) => a.date - b.date);
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Compute the full stats snapshot from workout history.
 * Trend values stay in min/mile and miles; only record display strings use `unit`.
 */
export function computeStats(
  history: CompletedWorkout[],
  unit: PaceUnit = 'minPerMile',
): StatsSnapshot {
  if (history.length === 0) {
    return {
      records: [],
      awards: [],
      totalDistanceMeters: 0,
      totalDurationMs: 0,
      totalWorkouts: 0,
      paceTrend: [],
      distanceTrend: [],
      durationTrend: [],
    };
  }

  const totalDistanceMeters = history.reduce(
    (sum, w) => sum + (w.totalDistanceMeters ?? 0),
    0,
  );
  const totalDurationMs = history.reduce(
    (sum, w) => sum + w.totalDurationMs,
    0,
  );

  return {
    records: computeRecords(history, unit),
    awards: computeAwards(history),
    totalDistanceMeters,
    totalDurationMs,
    totalWorkouts: history.length,
    paceTrend: computePaceTrend(history),
    distanceTrend: computeDistanceTrend(history),
    durationTrend: computeDurationTrend(history),
  };
}

/**
 * Detect which personal records were broken by a specific workout.
 * Compares records computed with vs without the given workout.
 */
export function detectNewRecords(
  history: CompletedWorkout[],
  workoutId: string,
  unit: PaceUnit = 'minPerMile',
): PersonalRecord[] {
  const allRecords = computeRecords(history, unit);
  const withoutWorkout = history.filter((w) => w.id !== workoutId);
  const oldRecords = computeRecords(withoutWorkout, unit);

  return allRecords.filter((record) => {
    if (record.workoutId !== history.find((w) => w.id === workoutId)?.workoutId) {
      return false;
    }
    if (record.completedAt !== history.find((w) => w.id === workoutId)?.completedAt) {
      return false;
    }
    const oldRecord = oldRecords.find((r) => r.category === record.category);
    if (!oldRecord) return true; // First time setting this record
    return HIGHER_IS_BETTER.includes(record.category)
      ? record.value > oldRecord.value
      : record.value < oldRecord.value;
  });
}

/**
 * Detect which awards were newly earned by a specific workout.
 */
export function detectNewAwards(
  history: CompletedWorkout[],
  workoutId: string,
): AwardBadge[] {
  const allAwards = computeAwards(history);
  const withoutWorkout = history.filter((w) => w.id !== workoutId);
  const oldAwards = computeAwards(withoutWorkout);
  const oldIds = new Set(oldAwards.map((a) => a.id));
  return allAwards.filter((a) => !oldIds.has(a.id));
}
