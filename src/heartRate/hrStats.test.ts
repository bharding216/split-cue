import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  downsampleHeartRate,
  heartRateAtTime,
  heartRateCoverage,
  recoveryDrop,
  sliceHeartRate,
  splitAtDropouts,
  summarizeHeartRate,
} from './hrStats';
import type { HrSample } from './hrTypes';

const START_TS = 1_700_000_000_000;

/** One reading per `stepMs`, starting at workout time `startT`. */
function series(bpms: number[], stepMs = 1000, startT = 0): HrSample[] {
  return bpms.map((bpm, i) => ({ t: startT + i * stepMs, ts: START_TS + startT + i * stepMs, bpm }));
}

test('summarizes average and max', () => {
  assert.deepEqual(summarizeHeartRate(series([140, 150, 160])), { avg: 150, max: 160 });
  assert.equal(summarizeHeartRate([]), null);
});

test('weights the average by time between readings', () => {
  const samples: HrSample[] = [
    { t: 0, ts: START_TS, bpm: 100 },
    { t: 3000, ts: START_TS + 3000, bpm: 200 },
  ];
  // 100 bpm held for 3 s, then 200 bpm for the nominal 1 s
  assert.equal(summarizeHeartRate(samples)!.avg, 125);
});

test('counts a dropout gap as a single nominal reading', () => {
  const samples: HrSample[] = [
    { t: 0, ts: START_TS, bpm: 100 },
    { t: 60_000, ts: START_TS + 60_000, bpm: 200 },
  ];
  assert.equal(summarizeHeartRate(samples)!.avg, 150);
});

test('slices samples to an interval, end exclusive', () => {
  const samples = series([100, 110, 120, 130, 140]);
  assert.deepEqual(
    sliceHeartRate(samples, 1000, 3000).map((s) => s.bpm),
    [110, 120],
  );
  assert.deepEqual(sliceHeartRate(samples, 10_000, 20_000), []);
});

test('recovery drop is the early peak minus the ending average', () => {
  // Peaks at 175 just after the effort; the last 5 s average 132.5.
  const bpms = [170, 175, 172, ...Array.from({ length: 24 }, (_, i) => 168 - i * 1.5), 131, 130, 129];
  assert.equal(recoveryDrop(series(bpms)), 43);
});

test('recovery drop needs a long enough recovery', () => {
  assert.equal(recoveryDrop(series([170, 160, 150, 140])), null);
  assert.equal(recoveryDrop([]), null);
});

test('downsamples to one reading per window', () => {
  const samples = series([100, 101, 102, 103, 104, 105], 400);
  assert.deepEqual(
    downsampleHeartRate(samples, 1000).map((s) => s.t),
    [0, 1200, 2000],
  );
});

test('splits the line at dropouts', () => {
  const samples = [...series([100, 101, 102]), ...series([110, 111], 1000, 30_000)];
  assert.deepEqual(splitAtDropouts(samples).map((run) => run.length), [3, 2]);
  assert.deepEqual(splitAtDropouts([]), []);
});

test('measures coverage and dropouts', () => {
  const samples = [...series([100, 101, 102]), ...series([110, 111], 1000, 30_000)];
  const coverage = heartRateCoverage(samples, 40_000);
  assert.equal(coverage.dropouts, 1);
  assert.equal(coverage.fraction, 4000 / 40_000);
  assert.deepEqual(heartRateCoverage([], 40_000), { fraction: 0, dropouts: 0 });
});

test('finds the nearest reading by wall-clock time within tolerance', () => {
  const samples = series([100, 110, 120], 2000);
  assert.equal(heartRateAtTime(samples, START_TS + 2400, 5000), 110);
  assert.equal(heartRateAtTime(samples, START_TS + 3400, 5000), 120);
  assert.equal(heartRateAtTime(samples, START_TS - 1000, 5000), 100);
  assert.equal(heartRateAtTime(samples, START_TS + 20_000, 5000), null);
  assert.equal(heartRateAtTime([], START_TS, 5000), null);
});
