/**
 * Paceprint — a compact visual fingerprint generated from a completed run.
 *
 * Always 20 tiles, each representing an equal duration of the run.
 * Color encodes pace relative to the session average:
 *   🟦 Blue   — slower than typical pace
 *   🟪 Purple — near typical pace
 *   🩷 Pink   — faster than typical pace
 *
 * A 20-minute run gets one-minute tiles; a two-hour run gets six-minute
 * tiles. Easy runs appear mostly uniform (all purple), which tells the
 * story of consistency. Intervals show alternating pink and blue.
 *
 * Pure functions, no storage or side effects.
 */

import { Colors } from '../constants/theme';
import type {
  CompletedWorkout,
  IntervalSplit,
  RoutePoint,
  WorkoutCategory,
} from '../workout/workoutTypes';

// ── Types ────────────────────────────────────────────────────────────

/** One cell in a Paceprint grid. */
export interface PaceprintCell {
  /** Hex color for this cell: paceprintSlow, paceprintTypical, or paceprintFast. */
  color: string;
  /** 0–1 height ratio. Always 1 in the 20-tile system (uniform height). */
  height: number;
  /** Width weight. All tiles equal (1 / cell count). */
  weight: number;
}

export interface PaceprintData {
  cells: PaceprintCell[];
  /** Detected or explicit category of the workout. */
  category: WorkoutCategory;
}

// ── Constants ────────────────────────────────────────────────────────

/** Every run is represented by exactly this many tiles. */
export const TILE_COUNT = 20;

/**
 * Pace deviation threshold: bins within ±3% of the session average pace
 * are colored as "near typical". Beyond that: blue (slower) or pink (faster).
 */
const NEAR_THRESHOLD = 0.03;

const MIN_PACE = 2.5;
const MAX_PACE = 30;
const MIN_ROUTE_POINTS = 4;

// ── Color helpers ────────────────────────────────────────────────────

function tileColor(paceMinPerMile: number, sessionAvgPace: number): string {
  const threshold = sessionAvgPace * NEAR_THRESHOLD;
  if (paceMinPerMile > sessionAvgPace + threshold) return Colors.paceprintSlow;
  if (paceMinPerMile < sessionAvgPace - threshold) return Colors.paceprintFast;
  return Colors.paceprintTypical;
}

// ── Binning from splits ──────────────────────────────────────────────

interface PaceBin {
  paceMinPerMile: number;
}

/**
 * Resample splits into `TILE_COUNT` equal-time bins. Each bin's pace is
 * the duration-weighted average of the splits that overlap with it.
 *
 * Uses the actual sum of split durations as the timeline so that bins
 * always cover the available pace data, even when splits don't account
 * for the full run duration.
 */
function binsFromSplits(splits: IntervalSplit[], _totalDurationMs: number): PaceBin[] {
  if (splits.length === 0) return [];

  // Build a pace timeline from the split sequence.
  const timeline: { startMs: number; endMs: number; pace: number }[] = [];
  let cursor = 0;
  for (const split of splits) {
    const pace = split.avgPaceMinPerMile;
    if (pace != null && isFinite(pace) && pace >= MIN_PACE && pace <= MAX_PACE) {
      timeline.push({ startMs: cursor, endMs: cursor + split.actualDurationMs, pace });
    }
    cursor += split.actualDurationMs;
  }

  if (timeline.length === 0 || cursor <= 0) return [];

  // Bin over the actual split timeline, not the full run duration.
  const timelineDuration = cursor;
  const binDuration = timelineDuration / TILE_COUNT;

  const bins: PaceBin[] = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    const binStart = i * binDuration;
    const binEnd = (i + 1) * binDuration;
    let weightedPace = 0;
    let totalWeight = 0;

    for (const seg of timeline) {
      const overlapStart = Math.max(binStart, seg.startMs);
      const overlapEnd = Math.min(binEnd, seg.endMs);
      if (overlapEnd > overlapStart) {
        const weight = overlapEnd - overlapStart;
        weightedPace += seg.pace * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight > 0) {
      bins.push({ paceMinPerMile: weightedPace / totalWeight });
    }
  }

  return bins;
}

// ── Binning from GPS ─────────────────────────────────────────────────

/**
 * Bin route points into `TILE_COUNT` equal-time segments, each with an
 * average pace. Returns fewer bins when there aren't enough data points.
 */
export function binRouteIntoPaces(
  route: RoutePoint[],
  totalDurationMs: number,
  count: number = TILE_COUNT,
): PaceBin[] {
  if (!route || route.length < MIN_ROUTE_POINTS || totalDurationMs <= 0) return [];

  const binDuration = totalDurationMs / count;
  const startTs = route[0].ts;
  const bins: PaceBin[] = [];

  for (let i = 0; i < count; i++) {
    const binStartTime = i * binDuration;
    const binEndTime = (i + 1) * binDuration;
    let binDist = 0;
    let binTime = 0;

    for (let j = 1; j < route.length; j++) {
      const prevTime = route[j - 1].ts - startTs;
      const currTime = route[j].ts - startTs;
      if (currTime <= prevTime) continue;

      const overlapStart = Math.max(binStartTime, prevTime);
      const overlapEnd = Math.min(binEndTime, currTime);
      if (overlapEnd > overlapStart) {
        const segDuration = currTime - prevTime;
        const segDist = route[j].dist - route[j - 1].dist;
        const fraction = (overlapEnd - overlapStart) / segDuration;
        binDist += segDist * fraction;
        binTime += overlapEnd - overlapStart;
      }
    }

    if (binDist > 5 && binTime > 500) {
      const metersPerMs = binDist / binTime;
      const minPerMile = (1609.34 / metersPerMs) / 60000;
      if (minPerMile >= MIN_PACE && minPerMile <= MAX_PACE) {
        bins.push({ paceMinPerMile: minPerMile });
      }
    }
  }

  return bins;
}

// ── Main algorithm ───────────────────────────────────────────────────

/**
 * Generate a Paceprint from a completed run.
 *
 * Produces exactly {@link TILE_COUNT} tiles when there is enough pace
 * data. Splits are preferred; GPS route is the fallback. When neither
 * provides enough data a single purple tile is returned.
 */
export function generatePaceprint(
  run: Pick<CompletedWorkout, 'totalDurationMs' | 'totalDistanceMeters' | 'route' | 'splits'>,
  category: WorkoutCategory,
): PaceprintData {
  const splits = run.splits ?? [];

  // Try splits first (need at least 3 to resample meaningfully), then GPS.
  let bins =
    splits.length >= 3
      ? binsFromSplits(splits, run.totalDurationMs)
      : [];

  if (bins.length < TILE_COUNT / 2) {
    const gpsBins = binRouteIntoPaces(run.route ?? [], run.totalDurationMs);
    if (gpsBins.length > bins.length) bins = gpsBins;
  }

  if (bins.length === 0) {
    return {
      cells: [{ color: Colors.paceprintTypical, height: 1, weight: 1 }],
      category,
    };
  }

  // Session average pace.
  const avgPace = bins.reduce((s, b) => s + b.paceMinPerMile, 0) / bins.length;

  const cells: PaceprintCell[] = bins.map((bin) => ({
    color: tileColor(bin.paceMinPerMile, avgPace),
    height: 1,
    weight: 1 / bins.length,
  }));

  return { cells, category };
}

// ── Emoji encoding ───────────────────────────────────────────────────

const EMOJI_BLUE = '🟦';
const EMOJI_PURPLE = '🟪';
const EMOJI_RED = '🟥';

/**
 * Convert a Paceprint into a single line of colored emoji,
 * suitable for plain-text sharing in captions and messages.
 *
 *   🟦 blue   = slower than typical
 *   🟪 purple = near typical pace
 *   🟥 red    = faster than typical
 */
export function paceprintToEmoji(data: PaceprintData): string {
  return data.cells
    .map((cell) => {
      if (cell.color === Colors.paceprintFast) return EMOJI_RED;
      if (cell.color === Colors.paceprintSlow) return EMOJI_BLUE;
      return EMOJI_PURPLE;
    })
    .join('');
}
