import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTIMATE_PACE_MIN_PER_MILE, METERS_PER_MILE, estimatedPlannedSeconds } from './workoutTypes';

test('timed intervals count their duration', () => {
  assert.equal(estimatedPlannedSeconds([{ durationSeconds: 300 }, { durationSeconds: 120 }]), 420);
});

test('distance intervals use their target pace', () => {
  assert.equal(
    estimatedPlannedSeconds([{ durationSeconds: 0, distanceMeters: METERS_PER_MILE, targetPace: 8 }]),
    480,
  );
});

test('distance intervals without a target pace use the default pace', () => {
  assert.equal(
    estimatedPlannedSeconds([{ durationSeconds: 0, distanceMeters: METERS_PER_MILE * 2 }]),
    ESTIMATE_PACE_MIN_PER_MILE * 60 * 2,
  );
});

test('mixed workouts no longer count only their timed parts', () => {
  // 8 x (400 m hard + 60 s jog): previously planned as 480 s.
  const reps = Array.from({ length: 8 }, () => [
    { durationSeconds: 0, distanceMeters: 400 },
    { durationSeconds: 60 },
  ]).flat();
  const seconds = estimatedPlannedSeconds(reps);
  assert.ok(seconds > 480 + 8 * 120, `expected well over 1440 s, got ${seconds}`);
});

test('manual intervals add nothing', () => {
  assert.equal(estimatedPlannedSeconds([{ durationSeconds: 0 }]), 0);
});
