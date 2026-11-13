import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CompletedWorkout, IntervalSplit } from '../workout/workoutTypes';
import { computeStats, detectNewAwards, detectNewRecords } from './personalRecords';

const MILE = 1609.344;
const DAY = 86_400_000;
// A Wednesday at local noon, so week math isn't near a boundary.
const START = new Date(2026, 0, 7, 12).getTime();

function rep(paceMin: number): IntervalSplit {
  return {
    label: 'Rep',
    type: 'hard',
    segmentType: 'run',
    plannedDurationSec: 0,
    actualDurationMs: paceMin * 60_000 * 0.25,
    distanceMeters: MILE / 4,
    avgPaceMinPerMile: paceMin,
    avgPaceMinPerKm: null,
    targetPace: undefined,
    effort: undefined,
  };
}

function run(id: string, completedAt: number, extra: Partial<CompletedWorkout> = {}): CompletedWorkout {
  return {
    id,
    workoutId: 'w1',
    workoutName: 'Session',
    completedAt,
    totalDurationMs: 30 * 60_000,
    totalDistanceMeters: 3 * MILE,
    ...extra,
  };
}

const ids = (list: { id: string }[]) => list.map((a) => a.id);

test('20 workouts earns the silver count award', () => {
  const history = Array.from({ length: 20 }, (_, i) => run(`r${i}`, START + i * DAY));
  assert.ok(ids(detectNewAwards(history, 'r19')).includes('count_20'));
  assert.ok(!ids(detectNewAwards(history.slice(0, 19), 'r18')).includes('count_20'));
});

test('first interval workout needs two work reps', () => {
  const single = [run('a', START, { splits: [rep(7)] })];
  assert.ok(!ids(computeStats(single).awards).includes('first_interval'));
  const history = [...single, run('b', START + DAY, { splits: [rep(7), rep(7)] })];
  assert.deepEqual(ids(detectNewAwards(history, 'b')), ['first_interval']);
});

test('four consecutive weeks earns the streak on the fourth week', () => {
  const history = [0, 1, 2, 3].map((w) => run(`r${w}`, START + w * 7 * DAY));
  assert.ok(ids(detectNewAwards(history, 'r3')).includes('streak_4wk'));
  assert.ok(!ids(computeStats(history.slice(0, 3)).awards).includes('streak_4wk'));
});

test('a gap week resets the streak', () => {
  const history = [0, 1, 3, 4].map((w) => run(`r${w}`, START + w * 7 * DAY));
  assert.ok(!ids(computeStats(history).awards).includes('streak_4wk'));
});

test('two runs in one week count as one week', () => {
  const history = [0, 1, 1.2, 2].map((w, i) => run(`r${i}`, START + w * 7 * DAY));
  assert.ok(!ids(computeStats(history).awards).includes('streak_4wk'));
});

test('a steadier interval session sets the consistency record', () => {
  const ragged = run('a', START, { splits: [rep(6.5), rep(7.5), rep(7)] });
  const steady = run('b', START + DAY, { splits: [rep(7), rep(7), rep(7.02)] });
  const records = detectNewRecords([ragged, steady], 'b');
  const record = records.find((r) => r.category === 'most_consistent_intervals');
  assert.ok(record);
  assert.equal(record.unit, '/100');
  assert.ok(record.value > 90);
});

test('a less consistent session does not set the consistency record', () => {
  const steady = run('a', START, { splits: [rep(7), rep(7), rep(7)] });
  const ragged = run('b', START + DAY, { splits: [rep(6.5), rep(7.5), rep(7)] });
  assert.ok(!detectNewRecords([steady, ragged], 'b').some((r) => r.category === 'most_consistent_intervals'));
});

test('biggest improvement compares with the previous run of the same workout', () => {
  const first = run('a', START, { totalDurationMs: 27 * 60_000 }); // 9:00/mi
  const second = run('b', START + DAY, { totalDurationMs: 26 * 60_000 }); // 8:40/mi
  const records = detectNewRecords([first, second], 'b');
  const record = records.find((r) => r.category === 'biggest_improvement');
  assert.ok(record);
  assert.equal(record.displayValue, '0:20');
  assert.equal(record.unit, '/mi faster');
});

test('improvement ignores runs of different workouts', () => {
  const first = run('a', START, { totalDurationMs: 27 * 60_000 });
  const other = run('b', START + DAY, { workoutId: 'w2', totalDurationMs: 24 * 60_000 });
  assert.ok(!computeStats([first, other]).records.some((r) => r.category === 'biggest_improvement'));
});
