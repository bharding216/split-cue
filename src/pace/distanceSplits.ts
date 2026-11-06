/**
 * Fixed-distance splits (every mile, half mile, quarter mile, ...) derived
 * from a finished run's GPS route.
 */

import { METERS_PER_MILE, type RoutePoint } from '../workout/workoutTypes';

export interface DistanceSplit {
  /** Cumulative distance at the end of this split. */
  endMeters: number;
  distanceMeters: number;
  durationMs: number;
  /** Null when the split is too short to give a meaningful pace. */
  paceMinPerMile: number | null;
  /** False for the shorter last split of a run that ends between marks. */
  complete: boolean;
}

/**
 * Route points carry no pause markers; a pause shows up as a gap between
 * fixes over which no distance was added. Shorter gaps are dropped fixes.
 */
const PAUSE_GAP_MS = 10_000;
/** A trailing partial split shorter than this is left out. */
const MIN_PARTIAL_METERS = 20;

/** Moving time (ms since the first fix, pauses excluded) at each route point. */
function movingTimes(route: RoutePoint[]): number[] {
  const times = [0];
  for (let i = 1; i < route.length; i++) {
    const dt = Math.max(0, route[i].ts - route[i - 1].ts);
    const paused = dt > PAUSE_GAP_MS && route[i].dist <= route[i - 1].dist;
    times.push(times[i - 1] + (paused ? 0 : dt));
  }
  return times;
}

export function computeDistanceSplits(route: RoutePoint[], stepMeters: number): DistanceSplit[] {
  if (route.length < 2 || stepMeters <= 0) return [];
  const times = movingTimes(route);
  const total = route[route.length - 1].dist;

  const splits: DistanceSplit[] = [];
  const push = (startMeters: number, endMeters: number, startMs: number, endMs: number, complete: boolean) => {
    const distanceMeters = endMeters - startMeters;
    const durationMs = endMs - startMs;
    splits.push({
      endMeters,
      distanceMeters,
      durationMs,
      paceMinPerMile:
        distanceMeters >= MIN_PARTIAL_METERS && durationMs > 0
          ? durationMs / 60_000 / (distanceMeters / METERS_PER_MILE)
          : null,
      complete,
    });
  };

  let prevMeters = 0;
  let prevMs = 0;
  let mark = stepMeters;
  for (let i = 1; i < route.length && mark <= total; i++) {
    const a = route[i - 1];
    const b = route[i];
    // A single long step can cross several marks
    while (mark <= b.dist && mark <= total) {
      const frac = b.dist > a.dist ? (mark - a.dist) / (b.dist - a.dist) : 1;
      const ms = times[i - 1] + frac * (times[i] - times[i - 1]);
      push(prevMeters, mark, prevMs, ms, true);
      prevMeters = mark;
      prevMs = ms;
      mark += stepMeters;
    }
  }

  if (total - prevMeters >= MIN_PARTIAL_METERS) {
    push(prevMeters, total, prevMs, times[times.length - 1], false);
  }
  return splits;
}
