/**
 * How heart rate relates to pace within a run, and how that changes over time.
 *
 * Each run gets a line of heart rate against speed, fitted over its steady,
 * flat stretches once heart rate has settled. Reading every run's line at one
 * reference pace gives a trend: a lower heart rate at the same pace means
 * better aerobic fitness.
 *
 * Pure functions over a run's GPS route and heart rate readings. Both carry
 * wall-clock timestamps, which is how they're matched.
 */

import type { PaceUnit } from '../pace/paceTypes';
import { smoothAltitudes } from '../pace/elevationAnalysis';
import type { RoutePoint } from '../workout/workoutTypes';
import type { HrSample } from './hrTypes';

const METERS_PER_MILE = 1_609.344;
const METERS_PER_KM = 1_000;

/** Bump when the calculation changes, so cached fits are recomputed. */
export const PACE_HR_VERSION = 1;

/** Length of each stretch the route is cut into. */
const STRETCH_MS = 30_000;
/** A longer gap between GPS fixes is a stop or a pause, and breaks the stretch. */
const MAX_FIX_GAP_MS = 10_000;
/** Heart rate needs this long to settle after the start. */
const WARMUP_MS = 10 * 60_000;
/** A stretch and the one before it must be this close in speed, so heart rate has caught up. */
const MAX_SPEED_CHANGE = 0.08;
/** Steeper stretches raise heart rate for reasons other than pace. */
const MAX_GRADE = 0.02;
/** Running speeds only: about 18:00/mi to 3:50/mi. */
const MIN_SPEED_MPS = 1.5;
const MAX_SPEED_MPS = 7;
/** A longer gap in heart rate readings within a stretch drops the stretch. */
const MAX_READING_GAP_MS = 5_000;
/** Runs with less steady running than this don't get a fit. */
const MIN_STEADY_MS = 10 * 60_000;

/**
 * Typical rise in heart rate per m/s of speed. Fits lean toward it when a
 * run's stretches cover a narrow range of speeds, which can't pin down a slope.
 */
const PRIOR_SLOPE = 35;
/** How strongly fits lean toward the typical slope, as a speed variance (m/s)². */
const PRIOR_WEIGHT = 0.01;
/** How far beyond a run's own speeds its line is trusted (m/s, about 45 s/mi at easy pace). */
const SPEED_MARGIN_MPS = 0.25;

/** Feels-like temperature at or above which heart rate runs noticeably higher. */
export const HOT_FEELS_LIKE_C = 27;

/** Heart rate against speed for one run. */
export interface PaceHrFit {
  /** bpm = intercept + slope × speed (m/s). */
  intercept: number;
  slope: number;
  /** Speed range of the steady stretches the line was fitted to (m/s). */
  minSpeed: number;
  maxSpeed: number;
  /** Average speed over the steady stretches (m/s). */
  meanSpeed: number;
  /** Total steady running the line was fitted to (ms). */
  steadyMs: number;
}

interface Stretch {
  startTs: number;
  endTs: number;
  /** Running time before the stretch, excluding stops and pauses (ms). */
  movingStartMs: number;
  speed: number;
  grade: number | null;
  /** Whether it starts right where the previous stretch ended. */
  followsPrevious: boolean;
}

/** Fit heart rate against speed for one run. Null when the run has too little steady running. */
export function fitPaceHeartRate(route: RoutePoint[], samples: HrSample[]): PaceHrFit | null {
  if (route.length < 2 || samples.length === 0) return null;
  const readings = [...samples].sort((a, b) => a.ts - b.ts);

  const points: { speed: number; bpm: number; weight: number }[] = [];
  const stretches = cutStretches(route);
  for (let i = 1; i < stretches.length; i++) {
    const s = stretches[i];
    const prev = stretches[i - 1];
    if (!s.followsPrevious || s.movingStartMs < WARMUP_MS) continue;
    if (s.speed < MIN_SPEED_MPS || s.speed > MAX_SPEED_MPS) continue;
    if (Math.abs(s.speed - prev.speed) / prev.speed > MAX_SPEED_CHANGE) continue;
    if (s.grade != null && Math.abs(s.grade) > MAX_GRADE) continue;
    const bpm = averageHeartRate(readings, s.startTs, s.endTs);
    if (bpm == null) continue;
    points.push({ speed: s.speed, bpm, weight: s.endTs - s.startTs });
  }

  const steadyMs = points.reduce((sum, p) => sum + p.weight, 0);
  if (steadyMs < MIN_STEADY_MS) return null;

  let meanSpeed = 0;
  let meanBpm = 0;
  for (const p of points) {
    meanSpeed += (p.speed * p.weight) / steadyMs;
    meanBpm += (p.bpm * p.weight) / steadyMs;
  }
  let variance = 0;
  let covariance = 0;
  for (const p of points) {
    variance += ((p.speed - meanSpeed) ** 2 * p.weight) / steadyMs;
    covariance += ((p.speed - meanSpeed) * (p.bpm - meanBpm) * p.weight) / steadyMs;
  }
  const slope = (covariance + PRIOR_WEIGHT * PRIOR_SLOPE) / (variance + PRIOR_WEIGHT);

  return {
    intercept: meanBpm - slope * meanSpeed,
    slope,
    minSpeed: Math.min(...points.map((p) => p.speed)),
    maxSpeed: Math.max(...points.map((p) => p.speed)),
    meanSpeed,
    steadyMs,
  };
}

/** The run's estimated heart rate at `speed`, or null when it ran nowhere near that speed. */
export function heartRateAtSpeed(fit: PaceHrFit, speed: number): number | null {
  if (speed < fit.minSpeed - SPEED_MARGIN_MPS || speed > fit.maxSpeed + SPEED_MARGIN_MPS) return null;
  return fit.intercept + fit.slope * speed;
}

/**
 * The pace to compare runs at: the runner's typical steady pace, rounded to
 * the nearest 15 seconds per unit so it reads cleanly and stays put as runs
 * are added. Returned as a speed (m/s).
 */
export function referenceSpeed(fits: PaceHrFit[], unit: PaceUnit): number | null {
  if (fits.length === 0) return null;
  const speeds = fits.map((f) => f.meanSpeed).sort((a, b) => a - b);
  const mid = speeds.length >> 1;
  const median = speeds.length % 2 ? speeds[mid] : (speeds[mid - 1] + speeds[mid]) / 2;
  const unitMeters = unit === 'minPerKm' ? METERS_PER_KM : METERS_PER_MILE;
  const paceSec = Math.round(unitMeters / median / 15) * 15;
  return unitMeters / paceSec;
}

export interface PaceHrRun {
  date: number;
  fit: PaceHrFit;
  feelsLikeC?: number;
}

export interface PaceHrTrendPoint {
  date: number;
  /** Estimated heart rate at the reference pace (bpm). */
  value: number;
  /** Hot enough that heart rate likely ran high. */
  hot: boolean;
}

/** Each run's heart rate at the reference speed, oldest first. Runs not near that speed are left out. */
export function paceHeartRateTrend(runs: PaceHrRun[], speed: number): PaceHrTrendPoint[] {
  const points: PaceHrTrendPoint[] = [];
  for (const run of runs) {
    const bpm = heartRateAtSpeed(run.fit, speed);
    if (bpm == null) continue;
    points.push({
      date: run.date,
      value: Math.round(bpm),
      hot: run.feelsLikeC != null && run.feelsLikeC >= HOT_FEELS_LIKE_C,
    });
  }
  return points.sort((a, b) => a.date - b.date);
}

const DAY_MS = 24 * 60 * 60_000;
/** A trend needs this many runs, spread over at least this many days. */
export const TREND_MIN_RUNS = 3;
export const TREND_MIN_DAYS = 14;

/** Whether there's enough history to show a trend rather than "building your baseline". */
export function isTrendReady(points: PaceHrTrendPoint[]): boolean {
  if (points.length < TREND_MIN_RUNS) return false;
  return points[points.length - 1].date - points[0].date >= TREND_MIN_DAYS * DAY_MS;
}

/** How far back runs count as the baseline a run is compared against. */
const BASELINE_DAYS = 30;
const BASELINE_MIN_RUNS = 2;

/**
 * How a run compares with the runs in the month before it: its heart rate at
 * the reference pace minus their median (bpm; negative is better). Hot runs
 * are left out of the baseline. Null when there aren't enough earlier runs.
 */
export function changeFromBaseline(points: PaceHrTrendPoint[], date: number): number | null {
  const current = points.find((p) => p.date === date);
  if (!current) return null;
  const baseline = points
    .filter((p) => !p.hot && p.date < date && p.date >= date - BASELINE_DAYS * DAY_MS)
    .map((p) => p.value)
    .sort((a, b) => a - b);
  if (baseline.length < BASELINE_MIN_RUNS) return null;
  const mid = baseline.length >> 1;
  const median = baseline.length % 2 ? baseline[mid] : (baseline[mid - 1] + baseline[mid]) / 2;
  return Math.round(current.value - median);
}

/** Cut the route into back-to-back stretches of about STRETCH_MS, breaking at stops and pauses. */
function cutStretches(route: RoutePoint[]): Stretch[] {
  const hasAltitude = route.some((p) => p.alt != null);
  const altitudes = hasAltitude ? smoothAltitudes(route) : null;
  const stretches: Stretch[] = [];
  let movingMs = 0;
  let start = 0;
  let followsPrevious = false;

  for (let i = 1; i < route.length; i++) {
    const gap = route[i].ts - route[i - 1].ts;
    if (gap > MAX_FIX_GAP_MS || gap < 0) {
      start = i;
      followsPrevious = false;
      continue;
    }
    movingMs += gap;
    const duration = route[i].ts - route[start].ts;
    if (duration < STRETCH_MS) continue;

    const distance = route[i].dist - route[start].dist;
    stretches.push({
      startTs: route[start].ts,
      endTs: route[i].ts,
      movingStartMs: movingMs - duration,
      speed: distance / (duration / 1000),
      grade: altitudes && distance > 0 ? (altitudes[i] - altitudes[start]) / distance : null,
      followsPrevious,
    });
    start = i;
    followsPrevious = true;
  }
  return stretches;
}

/** Average of the readings in [startTs, endTs), or null if they have a gap. `readings` sorted by `ts`. */
function averageHeartRate(readings: HrSample[], startTs: number, endTs: number): number | null {
  let lo = 0;
  let hi = readings.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (readings[mid].ts < startTs) lo = mid + 1;
    else hi = mid;
  }
  let sum = 0;
  let count = 0;
  let lastTs = startTs;
  for (let i = lo; i < readings.length && readings[i].ts < endTs; i++) {
    if (readings[i].ts - lastTs > MAX_READING_GAP_MS) return null;
    sum += readings[i].bpm;
    count++;
    lastTs = readings[i].ts;
  }
  if (count === 0 || endTs - lastTs > MAX_READING_GAP_MS) return null;
  return sum / count;
}
