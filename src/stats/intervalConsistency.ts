/**
 * Interval consistency — how evenly a runner held pace across the work reps
 * of an interval session.
 *
 * Only work reps with at least 100 m of GPS distance count. Each rep is
 * compared with its target pace when every counted rep has one, otherwise
 * with the runner's own average rep pace. The score falls 2 points per
 * second per mile of average deviation, so a session within 5 s/mi of
 * target scores 90 and one 50 s/mi off scores 0.
 *
 * Pure functions, no storage.
 */

import type { IntervalSplit } from '../workout/workoutTypes';

export const MIN_QUALIFYING_REPS = 3;
const MIN_REP_METERS = 100;
const POINTS_PER_SECOND = 2;
/** Paces outside this range (min/mile) are GPS noise or walking breaks. */
const MIN_PACE = 2.5;
const MAX_PACE = 30;

export interface IntervalConsistency {
  /** 0-100; higher is steadier. */
  score: number;
  /** What each rep was compared with. */
  basis: 'target' | 'average';
  /** Mean absolute deviation from the reference pace, seconds per mile. */
  avgDeviationSec: number;
  /** Largest single-rep deviation, seconds per mile. */
  maxDeviationSec: number;
  /** Last rep pace minus first, seconds per mile. Positive means the runner slowed. */
  fadeSec: number;
  /** Average pace of each counted rep, seconds per mile, in order. */
  repPaces: number[];
  /** Target pace of each counted rep (s/mi) when the basis is 'target'. */
  targetPaces: number[] | null;
}

function isWorkRep(split: IntervalSplit): boolean {
  return split.segmentType ? split.segmentType === 'run' : split.type === 'hard';
}

function hasUsablePace(pace: number | null | undefined): pace is number {
  return pace != null && isFinite(pace) && pace >= MIN_PACE && pace <= MAX_PACE;
}

/** The work reps that count toward consistency, in order. */
export function qualifyingReps(splits: IntervalSplit[] | undefined): IntervalSplit[] {
  return (splits ?? []).filter(
    (s) => isWorkRep(s) && (s.distanceMeters ?? 0) >= MIN_REP_METERS && hasUsablePace(s.avgPaceMinPerMile),
  );
}

/** Consistency of a run's work reps, or null with fewer than three counted reps. */
export function computeIntervalConsistency(splits: IntervalSplit[] | undefined): IntervalConsistency | null {
  const reps = qualifyingReps(splits);
  if (reps.length < MIN_QUALIFYING_REPS) return null;

  const paces = reps.map((r) => r.avgPaceMinPerMile! * 60);
  const allTargeted = reps.every((r) => hasUsablePace(r.targetPace));
  const mean = paces.reduce((s, p) => s + p, 0) / paces.length;
  const references = allTargeted ? reps.map((r) => r.targetPace! * 60) : paces.map(() => mean);

  const deviations = paces.map((p, i) => Math.abs(p - references[i]));
  const avgDeviationSec = deviations.reduce((s, d) => s + d, 0) / deviations.length;
  const score = Math.max(0, Math.min(100, Math.round(100 - avgDeviationSec * POINTS_PER_SECOND)));

  return {
    score,
    basis: allTargeted ? 'target' : 'average',
    avgDeviationSec: Math.round(avgDeviationSec * 10) / 10,
    maxDeviationSec: Math.round(Math.max(...deviations) * 10) / 10,
    fadeSec: Math.round(paces[paces.length - 1] - paces[0]),
    repPaces: paces.map((p) => Math.round(p)),
    targetPaces: allTargeted ? references.map((p) => Math.round(p)) : null,
  };
}
