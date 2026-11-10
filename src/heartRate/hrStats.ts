/**
 * Pure heart rate calculations over recorded samples.
 * Samples are assumed to be sorted by `t` (workout time).
 */

import { HR_MAX_GAP_MS, type HrSample } from './hrTypes';

/** Weight for a reading with no usable successor: monitors notify about once a second. */
const NOMINAL_SAMPLE_MS = 1000;

/** How long after a recovery starts to look for the peak, since heart rate lags the effort. */
const RECOVERY_PEAK_WINDOW_MS = 15_000;
/** Recovery end heart rate is averaged over this tail, to smooth single-beat noise. */
const RECOVERY_END_WINDOW_MS = 5_000;
/** Recoveries shorter than this don't give a meaningful drop. */
const MIN_RECOVERY_MS = 20_000;

export interface HrSummary {
  avg: number;
  max: number;
}

/**
 * Time-weighted average and maximum. Each reading counts for the time until
 * the next one, so uneven notification rates don't skew the average; gaps
 * longer than a dropout count as a single nominal reading.
 */
export function summarizeHeartRate(samples: HrSample[]): HrSummary | null {
  if (samples.length === 0) return null;
  let weighted = 0;
  let totalWeight = 0;
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const dt = i + 1 < samples.length ? samples[i + 1].t - s.t : NOMINAL_SAMPLE_MS;
    const weight = dt > 0 && dt <= HR_MAX_GAP_MS ? dt : NOMINAL_SAMPLE_MS;
    weighted += s.bpm * weight;
    totalWeight += weight;
    if (s.bpm > max) max = s.bpm;
  }
  return { avg: Math.round(weighted / totalWeight), max };
}

/** Samples with `startMs <= t < endMs`. */
export function sliceHeartRate(samples: HrSample[], startMs: number, endMs: number): HrSample[] {
  const lo = lowerBound(samples, startMs);
  const hi = lowerBound(samples, endMs);
  return samples.slice(lo, hi);
}

/**
 * How far heart rate fell during a recovery: the peak in its first seconds
 * (heart rate keeps climbing briefly after an effort ends) minus the average
 * of its last seconds. Null when the recovery is too short or the data too sparse.
 */
export function recoveryDrop(samples: HrSample[]): number | null {
  if (samples.length < 2) return null;
  const startT = samples[0].t;
  const endT = samples[samples.length - 1].t;
  if (endT - startT < MIN_RECOVERY_MS) return null;

  let peak = 0;
  let tailSum = 0;
  let tailCount = 0;
  for (const s of samples) {
    if (s.t - startT <= RECOVERY_PEAK_WINDOW_MS && s.bpm > peak) peak = s.bpm;
    if (endT - s.t <= RECOVERY_END_WINDOW_MS) {
      tailSum += s.bpm;
      tailCount++;
    }
  }
  if (peak === 0 || tailCount === 0) return null;
  return Math.round(peak - tailSum / tailCount);
}

/** Keep the first reading in each `stepMs` window of workout time. */
export function downsampleHeartRate(samples: HrSample[], stepMs = 1000): HrSample[] {
  const result: HrSample[] = [];
  let lastBucket = -1;
  for (const s of samples) {
    const bucket = Math.floor(s.t / stepMs);
    if (bucket === lastBucket) continue;
    result.push(s);
    lastBucket = bucket;
  }
  return result;
}

/** Split samples into continuous runs, breaking at dropouts. */
export function splitAtDropouts(samples: HrSample[]): HrSample[][] {
  const runs: HrSample[][] = [];
  let current: HrSample[] = [];
  for (const s of samples) {
    const prev = current[current.length - 1];
    if (prev && s.t - prev.t > HR_MAX_GAP_MS) {
      runs.push(current);
      current = [];
    }
    current.push(s);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/**
 * Reading closest in wall-clock time to `ts`, within `toleranceMs`.
 * `samples` must be sorted by `ts`.
 */
export function heartRateAtTime(
  samples: HrSample[],
  ts: number,
  toleranceMs: number,
): number | null {
  if (samples.length === 0) return null;
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].ts < ts) lo = mid + 1;
    else hi = mid;
  }
  let best: HrSample | null = null;
  for (const i of [lo - 1, lo]) {
    const s = samples[i];
    if (!s) continue;
    if (!best || Math.abs(s.ts - ts) < Math.abs(best.ts - ts)) best = s;
  }
  return best && Math.abs(best.ts - ts) <= toleranceMs ? best.bpm : null;
}

function lowerBound(samples: HrSample[], t: number): number {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
