import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IntervalSplit } from '../workout/workoutTypes';
import { computeIntervalConsistency, qualifyingReps } from './intervalConsistency';

function rep(paceMinPerMile: number | null, extra: Partial<IntervalSplit> = {}): IntervalSplit {
  return {
    label: 'Run',
    type: 'hard',
    segmentType: 'run',
    plannedDurationSec: 0,
    actualDurationMs: 90_000,
    distanceMeters: 400,
    avgPaceMinPerMile: paceMinPerMile,
    avgPaceMinPerKm: null,
    targetPace: undefined,
    effort: undefined,
    ...extra,
  };
}

const recovery = rep(12, { label: 'Recovery', type: 'easy', segmentType: 'recovery' });

test('needs three qualifying work reps', () => {
  assert.equal(computeIntervalConsistency([rep(7), recovery, rep(7)]), null);
  assert.equal(computeIntervalConsistency(undefined), null);
});

test('skips recoveries, short reps, and GPS noise', () => {
  const splits = [
    rep(7),
    recovery,
    rep(7, { distanceMeters: 60 }),
    rep(7, { distanceMeters: null }),
    rep(null),
    rep(1),
    rep(7.1),
    rep(6.9),
  ];
  assert.equal(qualifyingReps(splits).length, 3);
});

test('legacy splits without a segment type count hard intervals', () => {
  const legacy = (pace: number) => rep(pace, { segmentType: undefined });
  const result = computeIntervalConsistency([legacy(7), legacy(7), legacy(7), { ...recovery, segmentType: undefined }]);
  assert.equal(result?.repPaces.length, 3);
});

test('perfectly even reps score 100 with no fade', () => {
  const result = computeIntervalConsistency([rep(7), rep(7), rep(7), rep(7)]);
  assert.equal(result?.score, 100);
  assert.equal(result?.basis, 'average');
  assert.equal(result?.fadeSec, 0);
  assert.deepEqual(result?.repPaces, [420, 420, 420, 420]);
});

test('compares with targets when every rep has one', () => {
  // Each rep 5 s/mi off a 7:00 target: 90 points.
  const result = computeIntervalConsistency([
    rep(7 + 5 / 60, { targetPace: 7 }),
    rep(7 - 5 / 60, { targetPace: 7 }),
    rep(7 + 5 / 60, { targetPace: 7 }),
  ]);
  assert.equal(result?.basis, 'target');
  assert.equal(result?.score, 90);
  assert.equal(result?.avgDeviationSec, 5);
  assert.deepEqual(result?.targetPaces, [420, 420, 420]);
});

test('a fast start and fade scores lower than an even session, and reports the fade', () => {
  const even = computeIntervalConsistency([rep(7.2), rep(7.2), rep(7.2), rep(7.2)])!;
  // 6:30 → 7:30, faster on average but uneven.
  const fading = computeIntervalConsistency([rep(6.5), rep(6.83), rep(7.17), rep(7.5)])!;
  assert.ok(fading.score < even.score);
  assert.equal(fading.fadeSec, 60);
});

test('the score never drops below zero', () => {
  const result = computeIntervalConsistency([rep(5), rep(10), rep(5), rep(10)]);
  assert.equal(result?.score, 0);
});
