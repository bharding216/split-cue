/**
 * Compress workout history into a token-efficient summary for the AI coach.
 *
 * Instead of sending raw CompletedWorkout[] (which would burn thousands of
 * tokens), we pre-aggregate the data into a small structured summary that
 * gives the LLM everything it needs to make smart coaching recommendations:
 * volume trends, workout type distribution, recency, and intensity signals.
 *
 * The full summary serializes to ~150-400 tokens depending on history depth.
 */

import { CompletedWorkout, IntervalSplit } from '../workout/workoutTypes';

const MS_PER_DAY = 86_400_000;
const METERS_PER_MILE = 1_609.344;

// ── Types ────────────────────────────────────────────────────

export interface RecentWorkoutEntry {
  name: string;
  daysAgo: number;
  durationMin: number;
  distanceMi: number | null;
}

export interface HistorySummary {
  totalWorkoutsCompleted: number;
  workoutsLast7Days: number;
  workoutsLast30Days: number;
  avgWorkoutsPerWeek: number; // over last 4 weeks

  daysSinceLastWorkout: number | null; // null if no history
  lastWorkoutName: string | null;

  /** Last 5 workouts, heavily compressed */
  recentWorkouts: RecentWorkoutEntry[];

  /** Workout name → count in last 30 days (classified by keyword) */
  workoutTypeCounts: Record<string, number>;

  avgDurationMinLast7: number | null;
  avgDurationMinLast30: number | null;

  /** Mean effort across hard intervals in last 14 days */
  avgHardIntervalEffort: number | null;
  /** Fastest avg pace (min/mi) on any hard interval in last 30 days */
  bestPaceLast30Days: number | null;
}

// ── Workout type classification ──────────────────────────────

function classifyWorkout(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('tempo')) return 'tempo';
  if (n.includes('speed') || n.includes('400') || n.includes('sprint')) return 'speed';
  if (n.includes('hill')) return 'hills';
  if (n.includes('fartlek')) return 'fartlek';
  if (n.includes('easy') || n.includes('walk') || n.includes('run/walk')) return 'easy';
  if (n.includes('interval') || n.includes('repeat')) return 'intervals';
  if (n.includes('pyramid')) return 'pyramid';
  if (n.includes('long')) return 'long_run';
  if (n.includes('threshold')) return 'threshold';
  if (n.includes('5k') || n.includes('10k') || n.includes('race')) return 'race_pace';
  if (n.includes('mile')) return 'mile_intervals';
  return 'other';
}

// ── Builder ──────────────────────────────────────────────────

export function buildHistorySummary(history: CompletedWorkout[]): HistorySummary {
  const now = Date.now();

  // Time windows
  const cutoff7 = now - 7 * MS_PER_DAY;
  const cutoff14 = now - 14 * MS_PER_DAY;
  const cutoff30 = now - 30 * MS_PER_DAY;
  const cutoff28 = now - 28 * MS_PER_DAY; // 4 full weeks for avg

  const last7 = history.filter((w) => w.completedAt >= cutoff7);
  const last14 = history.filter((w) => w.completedAt >= cutoff14);
  const last30 = history.filter((w) => w.completedAt >= cutoff30);
  const last28 = history.filter((w) => w.completedAt >= cutoff28);

  // Recent workouts (last 5)
  const recentWorkouts: RecentWorkoutEntry[] = history.slice(0, 5).map((w) => ({
    name: w.workoutName,
    daysAgo: Math.round((now - w.completedAt) / MS_PER_DAY),
    durationMin: Math.round(w.totalDurationMs / 60_000),
    distanceMi:
      w.totalDistanceMeters != null
        ? Math.round((w.totalDistanceMeters / METERS_PER_MILE) * 100) / 100
        : null,
  }));

  // Workout type distribution (last 30 days)
  const workoutTypeCounts: Record<string, number> = {};
  for (const w of last30) {
    const type = classifyWorkout(w.workoutName);
    workoutTypeCounts[type] = (workoutTypeCounts[type] ?? 0) + 1;
  }

  // Average duration
  const avgDuration = (workouts: CompletedWorkout[]): number | null => {
    if (workouts.length === 0) return null;
    const total = workouts.reduce((sum, w) => sum + w.totalDurationMs, 0);
    return Math.round(total / workouts.length / 60_000);
  };

  // Hard interval effort (last 14 days)
  const hardEfforts: number[] = [];
  for (const w of last14) {
    if (!w.splits) continue;
    for (const split of w.splits) {
      if (split.type === 'hard' && split.effort != null) {
        hardEfforts.push(split.effort);
      }
    }
  }
  const avgHardIntervalEffort =
    hardEfforts.length > 0
      ? Math.round((hardEfforts.reduce((a, b) => a + b, 0) / hardEfforts.length) * 10) / 10
      : null;

  // Best pace on hard intervals (last 30 days)
  let bestPace: number | null = null;
  for (const w of last30) {
    if (!w.splits) continue;
    for (const split of w.splits) {
      if (
        split.type === 'hard' &&
        split.avgPaceMinPerMile != null &&
        isFinite(split.avgPaceMinPerMile)
      ) {
        if (bestPace === null || split.avgPaceMinPerMile < bestPace) {
          bestPace = split.avgPaceMinPerMile;
        }
      }
    }
  }
  if (bestPace != null) {
    bestPace = Math.round(bestPace * 100) / 100;
  }

  // Avg workouts per week (last 4 weeks)
  const avgWorkoutsPerWeek =
    last28.length > 0
      ? Math.round((last28.length / 4) * 10) / 10
      : 0;

  // Days since last workout
  const daysSinceLastWorkout =
    history.length > 0
      ? Math.round((now - history[0].completedAt) / MS_PER_DAY)
      : null;

  return {
    totalWorkoutsCompleted: history.length,
    workoutsLast7Days: last7.length,
    workoutsLast30Days: last30.length,
    avgWorkoutsPerWeek,
    daysSinceLastWorkout,
    lastWorkoutName: history.length > 0 ? history[0].workoutName : null,
    recentWorkouts,
    workoutTypeCounts,
    avgDurationMinLast7: avgDuration(last7),
    avgDurationMinLast30: avgDuration(last30),
    avgHardIntervalEffort,
    bestPaceLast30Days: bestPace,
  };
}

// ── Serialization for system prompt ──────────────────────────

/**
 * Format a pace value as M:SS string (e.g. 7.5 → "7:30").
 */
function formatPace(pace: number): string {
  const total = Math.round(pace * 60);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Serialize the summary into a concise text block for the LLM system prompt.
 * Returns null if the user has no history (skip the section entirely).
 */
export function serializeHistorySummary(summary: HistorySummary): string | null {
  if (summary.totalWorkoutsCompleted === 0) return null;

  const lines: string[] = [];

  // Volume headline
  lines.push(
    `${summary.totalWorkoutsCompleted} total workouts | ` +
    `${summary.workoutsLast7Days} this week | ` +
    `${summary.workoutsLast30Days} this month | ` +
    `avg ${summary.avgWorkoutsPerWeek}/week`
  );

  // Last workout
  if (summary.lastWorkoutName != null && summary.daysSinceLastWorkout != null) {
    const ago =
      summary.daysSinceLastWorkout === 0
        ? 'today'
        : summary.daysSinceLastWorkout === 1
          ? 'yesterday'
          : `${summary.daysSinceLastWorkout}d ago`;
    lines.push(`Last workout: "${summary.lastWorkoutName}" (${ago})`);
  }

  // Recent workouts
  if (summary.recentWorkouts.length > 1) {
    const recent = summary.recentWorkouts.slice(1); // skip the first (already shown as "last workout")
    const parts = recent.map((w) => {
      const ago = w.daysAgo === 0 ? 'today' : `${w.daysAgo}d ago`;
      return `${w.name} (${ago})`;
    });
    lines.push(`Recent: ${parts.join(', ')}`);
  }

  // Type distribution
  const types = Object.entries(summary.workoutTypeCounts);
  if (types.length > 0) {
    types.sort((a, b) => b[1] - a[1]);
    const parts = types.map(([type, count]) => `${type} ×${count}`);
    lines.push(`Last 30d by type: ${parts.join(', ')}`);
  }

  // Duration trends
  if (summary.avgDurationMinLast7 != null || summary.avgDurationMinLast30 != null) {
    const parts: string[] = [];
    if (summary.avgDurationMinLast7 != null) parts.push(`${summary.avgDurationMinLast7} min (7d)`);
    if (summary.avgDurationMinLast30 != null) parts.push(`${summary.avgDurationMinLast30} min (30d)`);
    lines.push(`Avg duration: ${parts.join(' / ')}`);
  }

  // Intensity signals
  const intensity: string[] = [];
  if (summary.avgHardIntervalEffort != null) {
    intensity.push(`Hard interval effort avg: ${summary.avgHardIntervalEffort}/10`);
  }
  if (summary.bestPaceLast30Days != null) {
    intensity.push(`Best hard pace: ${formatPace(summary.bestPaceLast30Days)}/mi`);
  }
  if (intensity.length > 0) lines.push(intensity.join(' | '));

  return lines.join('\n');
}
