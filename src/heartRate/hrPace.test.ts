import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changeFromBaseline,
  fitPaceHeartRate,
  heartRateAtSpeed,
  isTrendReady,
  paceHeartRateTrend,
  referenceSpeed,
  type PaceHrFit,
  type PaceHrTrendPoint,
} from './hrPace';
import type { HrSample } from './hrTypes';
import type { RoutePoint } from '../workout/workoutTypes';

const START_TS = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60_000;

interface Leg {
  minutes: number;
  /** m/s */
  speed: number;
  bpm: number;
  /** Rise over run, e.g. 0.05 for a 5% climb. */
  grade?: number;
  /** Leave out heart rate readings for this leg. */
  noReadings?: boolean;
}

/** A run with one GPS fix and one heart rate reading per second. */
function makeRun(legs: Leg[]): { route: RoutePoint[]; samples: HrSample[] } {
  const route: RoutePoint[] = [{ lat: 0, lng: 0, alt: 100, ts: START_TS, dist: 0 }];
  const samples: HrSample[] = [{ t: 0, ts: START_TS, bpm: legs[0].bpm }];
  let t = 0;
  let dist = 0;
  let alt = 100;
  for (const leg of legs) {
    for (let s = 0; s < leg.minutes * 60; s++) {
      t += 1000;
      dist += leg.speed;
      alt += leg.speed * (leg.grade ?? 0);
      route.push({ lat: 0, lng: 0, alt, ts: START_TS + t, dist });
      if (!leg.noReadings) samples.push({ t, ts: START_TS + t, bpm: leg.bpm });
    }
  }
  return { route, samples };
}

function fit(legs: Leg[]): PaceHrFit {
  const run = makeRun(legs);
  const result = fitPaceHeartRate(run.route, run.samples);
  assert.ok(result, 'expected a fit');
  return result;
}

function near(actual: number | null, expected: number, tolerance = 1) {
  assert.ok(actual != null, `expected about ${expected}, got null`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected about ${expected}, got ${actual}`);
}

test('fits a steady run', () => {
  const f = fit([{ minutes: 30, speed: 3, bpm: 150 }]);
  near(heartRateAtSpeed(f, 3), 150);
  near(f.meanSpeed, 3, 0.01);
});

test('separates heart rate at two paces', () => {
  const f = fit([
    { minutes: 15, speed: 2.8, bpm: 140 },
    { minutes: 15, speed: 3.4, bpm: 160 },
  ]);
  near(heartRateAtSpeed(f, 2.8), 140, 2);
  near(heartRateAtSpeed(f, 3.4), 160, 2);
});

test('leans toward a typical slope when the run is all one pace', () => {
  const f = fit([{ minutes: 30, speed: 3, bpm: 150 }]);
  near(f.slope, 35, 0.5);
});

test('ignores the warm-up while heart rate settles', () => {
  const f = fit([
    { minutes: 10, speed: 3, bpm: 120 },
    { minutes: 20, speed: 3, bpm: 150 },
  ]);
  near(heartRateAtSpeed(f, 3), 150);
});

test('ignores hills', () => {
  const f = fit([
    { minutes: 15, speed: 3, bpm: 150 },
    { minutes: 5, speed: 3, bpm: 175, grade: 0.05 },
    { minutes: 15, speed: 3, bpm: 150 },
  ]);
  near(heartRateAtSpeed(f, 3), 150);
});

test('skips stretches without heart rate readings', () => {
  const f = fit([
    { minutes: 15, speed: 3, bpm: 150 },
    { minutes: 5, speed: 3, bpm: 0, noReadings: true },
    { minutes: 15, speed: 3, bpm: 150 },
  ]);
  near(heartRateAtSpeed(f, 3), 150);
});

test('ignores walking', () => {
  const f = fit([
    { minutes: 25, speed: 3, bpm: 150 },
    { minutes: 10, speed: 1.2, bpm: 110 },
  ]);
  near(f.minSpeed, 3, 0.01);
});

test('needs enough steady running', () => {
  const short = makeRun([{ minutes: 15, speed: 3, bpm: 150 }]);
  assert.equal(fitPaceHeartRate(short.route, short.samples), null);
  const run = makeRun([{ minutes: 30, speed: 3, bpm: 150 }]);
  assert.equal(fitPaceHeartRate(run.route, []), null);
  assert.equal(fitPaceHeartRate([], run.samples), null);
});

test('breaks stretches at pauses', () => {
  const run = makeRun([{ minutes: 30, speed: 3, bpm: 150 }]);
  // A 5-minute pause after every 20 s of running leaves no full stretch.
  const paused = run.route.map((p, i) => ({ ...p, ts: p.ts + Math.floor(i / 20) * 300_000 }));
  assert.equal(fitPaceHeartRate(paused, run.samples), null);
});

test('only trusts a run near the speeds it ran', () => {
  const f = fit([{ minutes: 30, speed: 3, bpm: 150 }]);
  assert.ok(heartRateAtSpeed(f, 3.2) != null);
  assert.equal(heartRateAtSpeed(f, 3.5), null);
  assert.equal(heartRateAtSpeed(f, 2.5), null);
});

test('reference pace is the typical pace, rounded to 15 seconds', () => {
  const fits = [2.7, 2.82, 3.4].map((speed) => ({ ...fit([{ minutes: 30, speed, bpm: 150 }]) }));
  // Median 2.82 m/s is 9:30.7/mi, which rounds to 9:30.
  near(referenceSpeed(fits, 'minPerMile'), 1609.344 / 570, 0.001);
  // 2.82 m/s is 5:54.6/km, which rounds to 6:00.
  near(referenceSpeed(fits, 'minPerKm'), 1000 / 360, 0.001);
  assert.equal(referenceSpeed([], 'minPerMile'), null);
});

test('trend reads every run at the reference pace, oldest first', () => {
  const easy = fit([{ minutes: 30, speed: 3, bpm: 150 }]);
  const fitter = fit([{ minutes: 30, speed: 3, bpm: 144 }]);
  const fast = fit([{ minutes: 30, speed: 4, bpm: 170 }]);
  const trend = paceHeartRateTrend(
    [
      { date: START_TS + 2 * DAY_MS, fit: fitter, feelsLikeC: 30 },
      { date: START_TS, fit: easy, feelsLikeC: 15 },
      { date: START_TS + DAY_MS, fit: fast },
    ],
    3,
  );
  assert.deepEqual(trend, [
    { date: START_TS, value: 150, hot: false },
    { date: START_TS + 2 * DAY_MS, value: 144, hot: true },
  ]);
});

function points(days: number[], values: number[], hot: boolean[] = []): PaceHrTrendPoint[] {
  return days.map((d, i) => ({ date: START_TS + d * DAY_MS, value: values[i], hot: hot[i] ?? false }));
}

test('trend needs a few runs over two weeks', () => {
  assert.equal(isTrendReady(points([0, 7], [150, 149])), false);
  assert.equal(isTrendReady(points([0, 3, 7], [150, 149, 148])), false);
  assert.equal(isTrendReady(points([0, 7, 14], [150, 149, 148])), true);
});

test('compares a run with the month before it', () => {
  const trend = points([0, 10, 20, 25, 40], [160, 150, 152, 170, 147], [false, false, false, true, false]);
  // Baseline for day 40 is days 10 and 20 (day 0 is too old, day 25 was hot): median 151.
  assert.equal(changeFromBaseline(trend, START_TS + 40 * DAY_MS), -4);
  assert.equal(changeFromBaseline(trend, START_TS + 10 * DAY_MS), null);
  assert.equal(changeFromBaseline(trend, START_TS + 99 * DAY_MS), null);
});
