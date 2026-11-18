/**
 * Paceprint — a compact visual fingerprint generated from a completed run.
 *
 * Each split or GPS segment maps to a colored cell whose height reflects
 * duration and whose color encodes how well the runner hit their target.
 * Different workout types produce recognizably different patterns:
 *
 *  - Easy runs:   even-height blocks, colored by pace consistency
 *  - Intervals:   tall work reps alternating with short recovery blocks
 *  - Tempo:       uniform blocks showing fade or hold
 *  - Long runs:   many blocks, gradually shifting color
 *  - Races:       dense blocks with a final kick or fade
 *
 * Pure functions, no storage or side effects.
 */

import { Colors } from '../constants/theme';
import type {
  CompletedWorkout,
  IntervalSplit,
  RoutePoint,
  SegmentType,
  WorkoutCategory,
} from '../workout/workoutTypes';

// ── Types ────────────────────────────────────────────────────────────

/** The shape drawn for a single cell. */
export type CellShape = 'work' | 'recovery' | 'warmup' | 'cooldown';

/** One cell in a Paceprint grid. */
export interface PaceprintCell {
  /** Hex color for this cell. */
  color: string;
  /** 0–1 height ratio relative to the tallest cell. */
  height: number;
  /** Visual shape category. */
  shape: CellShape;
  /** Width weight (proportional to duration). Normalized to sum = 1 later. */
  weight: number;
}

export interface PaceprintData {
  cells: PaceprintCell[];
  /** Detected or explicit category of the workout. */
  category: WorkoutCategory;
}

// ── Constants ────────────────────────────────────────────────────────

/** Pace thresholds in seconds per mile for the three accuracy tiers. */
const ON_TARGET_THRESHOLD = 5;
const CLOSE_THRESHOLD = 15;

const MIN_PACE = 2.5;
const MAX_PACE = 30;

/** When a run has fewer splits than this we synthesize from GPS. */
const MIN_SPLITS_FOR_PATTERN = 3;

/** Number of synthetic bins when splitting a GPS track. */
const GPS_BIN_COUNT = 10;

// ── Color helpers ────────────────────────────────────────────────────

/** Performance color: how close the runner was to target/average. */
function accuracyColor(deviationSec: number): string {
  if (deviationSec <= ON_TARGET_THRESHOLD) return Colors.primary;   // green
  if (deviationSec <= CLOSE_THRESHOLD) return Colors.warning;       // yellow
  return Colors.danger;                                              // red
}

/** Muted version of a segment-type color (used for non-work segments). */
function shapeColor(shape: CellShape): string {
  switch (shape) {
    case 'warmup':
      return Colors.warmup + 'AA';
    case 'cooldown':
      return Colors.cooldown + 'AA';
    case 'recovery':
      return Colors.accent + '77';
    default:
      return Colors.primary;
  }
}

function cellShapeFor(segType: SegmentType | undefined, legacyType: string): CellShape {
  const t = segType ?? legacyType;
  switch (t) {
    case 'warmup':
      return 'warmup';
    case 'cooldown':
      return 'cooldown';
    case 'recovery':
    case 'easy':
    case 'rest':
      return 'recovery';
    default:
      return 'work';
  }
}

function isWorkCell(shape: CellShape): boolean {
  return shape === 'work';
}

function hasUsablePace(pace: number | null | undefined): pace is number {
  return pace != null && isFinite(pace) && pace >= MIN_PACE && pace <= MAX_PACE;
}

// ── GPS binning (for runs with few or no splits) ─────────────────────

interface GpsBin {
  durationMs: number;
  paceMinPerMile: number;
}

/**
 * Bin route points into `count` roughly equal-time segments, each with
 * an average pace. Returns an empty array when there aren't enough points.
 */
export function binRouteIntoPaces(
  route: RoutePoint[],
  totalDurationMs: number,
  count: number = GPS_BIN_COUNT,
): GpsBin[] {
  if (!route || route.length < 4 || totalDurationMs <= 0) return [];

  const binDuration = totalDurationMs / count;
  const startTs = route[0].ts;
  const bins: GpsBin[] = [];
  let binStart = 0;
  let binDist = 0;
  let binTime = 0;
  let prevDist = route[0].dist;
  let prevTs = route[0].ts;

  for (let i = 1; i < route.length; i++) {
    const pt = route[i];
    const elapsed = pt.ts - startTs;
    const dt = pt.ts - prevTs;
    const dd = pt.dist - prevDist;

    if (dt <= 0) {
      prevDist = pt.dist;
      prevTs = pt.ts;
      continue;
    }

    binDist += dd;
    binTime += dt;
    prevDist = pt.dist;
    prevTs = pt.ts;

    const binIdx = Math.floor(elapsed / binDuration);
    if (binIdx > binStart || i === route.length - 1) {
      if (binDist > 10 && binTime > 1000) {
        const metersPerMs = binDist / binTime;
        const minPerMile = (1609.34 / metersPerMs) / 60000;
        if (minPerMile >= MIN_PACE && minPerMile <= MAX_PACE) {
          bins.push({ durationMs: binTime, paceMinPerMile: minPerMile });
        }
      }
      binStart = binIdx;
      binDist = 0;
      binTime = 0;
    }
  }

  return bins;
}

// ── Main algorithm ───────────────────────────────────────────────────

/**
 * Generate a Paceprint from a completed workout's data.
 *
 * Accepts the completed run plus its workout category. When splits are
 * too few the route GPS data is binned into synthetic segments.
 */
export function generatePaceprint(
  run: Pick<CompletedWorkout, 'totalDurationMs' | 'totalDistanceMeters' | 'route' | 'splits'>,
  category: WorkoutCategory,
): PaceprintData {
  const splits = run.splits ?? [];

  // Use splits when there are enough; otherwise fall back to GPS bins.
  const cells =
    splits.length >= MIN_SPLITS_FOR_PATTERN
      ? cellsFromSplits(splits, category)
      : cellsFromGps(run.route ?? [], run.totalDurationMs, category);

  if (cells.length === 0) {
    return { cells: [{ color: Colors.primary, height: 1, shape: 'work', weight: 1 }], category };
  }

  // Normalize heights: tallest cell = 1.
  const maxH = Math.max(...cells.map((c) => c.height));
  if (maxH > 0) {
    for (const c of cells) c.height = c.height / maxH;
  }

  // Normalize weights to sum to 1.
  const totalW = cells.reduce((s, c) => s + c.weight, 0);
  if (totalW > 0) {
    for (const c of cells) c.weight = c.weight / totalW;
  }

  return { cells, category };
}

// ── From splits ──────────────────────────────────────────────────────

function cellsFromSplits(splits: IntervalSplit[], category: WorkoutCategory): PaceprintCell[] {
  // Compute average pace of work segments for relative coloring.
  const workPaces = splits
    .filter((s) => {
      const shape = cellShapeFor(s.segmentType, s.type);
      return isWorkCell(shape) && hasUsablePace(s.avgPaceMinPerMile);
    })
    .map((s) => s.avgPaceMinPerMile! * 60); // seconds per mile

  const avgWorkPace = workPaces.length > 0 ? workPaces.reduce((a, b) => a + b, 0) / workPaces.length : 0;

  return splits.slice(0, 60).map((split) => {
    const shape = cellShapeFor(split.segmentType, split.type);
    const durationMs = split.actualDurationMs;

    let color: string;
    if (!isWorkCell(shape)) {
      color = shapeColor(shape);
    } else if (hasUsablePace(split.avgPaceMinPerMile)) {
      const pace = split.avgPaceMinPerMile! * 60; // s/mi
      const ref =
        hasUsablePace(split.targetPace) ? split.targetPace! * 60 : avgWorkPace;
      const deviation = Math.abs(pace - ref);
      color = accuracyColor(deviation);
    } else {
      color = Colors.textMuted;
    }

    // Height: work segments are taller, recovery/warmup/cooldown shorter.
    const baseHeight = isWorkCell(shape) ? 1.0 : heightForNonWork(shape, category);

    return {
      color,
      height: baseHeight,
      shape,
      weight: Math.max(durationMs, 1000),
    };
  });
}

/**
 * Non-work segments get a reduced height so the alternating pattern is
 * visually distinctive — especially for interval workouts.
 */
function heightForNonWork(shape: CellShape, category: WorkoutCategory): number {
  if (category === 'intervals') {
    // Exaggerate the contrast for intervals so the tall/short rhythm pops.
    return shape === 'recovery' ? 0.35 : 0.5;
  }
  return shape === 'warmup' || shape === 'cooldown' ? 0.6 : 0.45;
}

// ── From GPS ─────────────────────────────────────────────────────────

function cellsFromGps(
  route: RoutePoint[],
  totalDurationMs: number,
  category: WorkoutCategory,
): PaceprintCell[] {
  const bins = binRouteIntoPaces(route, totalDurationMs);
  if (bins.length === 0) return [];

  const avgPace = bins.reduce((s, b) => s + b.paceMinPerMile, 0) / bins.length;
  const avgSec = avgPace * 60;

  return bins.map((bin) => {
    const paceSec = bin.paceMinPerMile * 60;
    const deviation = Math.abs(paceSec - avgSec);
    return {
      color: accuracyColor(deviation),
      height: 1.0,
      shape: 'work' as CellShape,
      weight: bin.durationMs,
    };
  });
}

// ── Emoji encoding ───────────────────────────────────────────────────

const EMOJI_GREEN = '🟩';
const EMOJI_YELLOW = '🟨';
const EMOJI_RED = '🟥';
const EMOJI_BLUE = '🟦';

/**
 * Convert a Paceprint into a single line of colored square emoji,
 * suitable for plain-text sharing in captions and messages.
 */
export function paceprintToEmoji(data: PaceprintData): string {
  return data.cells
    .map((cell) => {
      if (cell.shape === 'recovery') return EMOJI_BLUE;
      if (cell.shape === 'warmup' || cell.shape === 'cooldown') return EMOJI_BLUE;
      if (cell.color === Colors.primary || cell.color.startsWith(Colors.primary)) return EMOJI_GREEN;
      if (cell.color === Colors.warning || cell.color.startsWith(Colors.warning)) return EMOJI_YELLOW;
      if (cell.color === Colors.danger || cell.color.startsWith(Colors.danger)) return EMOJI_RED;
      return EMOJI_GREEN;
    })
    .join('');
}
