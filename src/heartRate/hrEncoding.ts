/**
 * Compact storage format for a run's heart rate readings, used for the
 * on-device sample file and the `workout_hr_samples` cloud row.
 *
 * Times are stored as deltas from the previous reading, which keeps a
 * 30-minute run at about 1,800 small integers per array. Readings are kept
 * exactly as recorded, including dropout gaps.
 */

import type { HrSample } from './hrTypes';

export const HR_ENCODING_VERSION = 1;

export interface EncodedHeartRate {
  v: typeof HR_ENCODING_VERSION;
  /** Wall-clock time of the first reading (epoch ms). */
  startTs: number;
  /** Workout time (ms) since the previous reading; the first is since workout start. */
  t: number[];
  /** Wall-clock time (ms) since the previous reading; the first is 0. */
  ts: number[];
  bpm: number[];
}

export function encodeHeartRate(samples: HrSample[]): EncodedHeartRate {
  const t: number[] = [];
  const ts: number[] = [];
  const bpm: number[] = [];
  let prevT = 0;
  let prevTs = samples[0]?.ts ?? 0;
  for (const s of samples) {
    t.push(Math.round(s.t - prevT));
    ts.push(Math.round(s.ts - prevTs));
    bpm.push(s.bpm);
    prevT += t[t.length - 1];
    prevTs += ts[ts.length - 1];
  }
  return { v: HR_ENCODING_VERSION, startTs: samples[0]?.ts ?? 0, t, ts, bpm };
}

/** Null when the data isn't a version this app understands. */
export function decodeHeartRate(data: unknown): HrSample[] | null {
  const d = data as Partial<EncodedHeartRate> | null;
  if (!d || d.v !== HR_ENCODING_VERSION) return null;
  if (!Array.isArray(d.t) || !Array.isArray(d.ts) || !Array.isArray(d.bpm)) return null;
  if (d.t.length !== d.bpm.length || d.ts.length !== d.bpm.length) return null;
  const samples: HrSample[] = [];
  let t = 0;
  let ts = d.startTs ?? 0;
  for (let i = 0; i < d.bpm.length; i++) {
    t += d.t[i];
    ts += d.ts[i];
    samples.push({ t, ts, bpm: d.bpm[i] });
  }
  return samples;
}
