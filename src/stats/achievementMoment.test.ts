import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAchievementMoment } from './achievementMoment';
import type { AwardBadge, PersonalRecord } from './personalRecords';

const record: PersonalRecord = {
  category: 'fastest_5k',
  label: 'Fastest 5K',
  icon: 'ribbon-outline',
  value: 1_308_000,
  displayValue: '21:48',
  unit: '',
  workoutId: 'w1',
  workoutName: 'Tempo',
  completedAt: 0,
};

const award = (id: string, tier: AwardBadge['tier']): AwardBadge => ({
  id,
  label: id,
  description: id,
  icon: 'star',
  tier,
  earnedAt: 0,
});

const base = {
  run: { totalDurationMs: 30 * 60_000 },
  totals: { workouts: 12, distanceMeters: 50_000 },
  unit: 'minPerMile' as const,
};

test('a record is celebrated as a new PR', () => {
  const moment = pickAchievementMoment({ ...base, records: [record], awards: [award('count_10', 'bronze')] });
  assert.equal(moment?.kicker, 'New PR');
  assert.equal(moment?.value, '21:48');
  assert.equal(moment?.label, 'Fastest 5K');
  assert.deepEqual(moment?.totals?.map((t) => t.label), ['Workouts', 'Logged']);
});

test('short runs are never celebrated', () => {
  const moment = pickAchievementMoment({
    ...base,
    run: { totalDurationMs: 4 * 60_000 },
    records: [record],
    awards: [award('count_100', 'gold')],
  });
  assert.equal(moment, null);
});

test('records on a first run are not celebrated', () => {
  const moment = pickAchievementMoment({ ...base, totals: { workouts: 1, distanceMeters: 5000 }, records: [record], awards: [] });
  assert.equal(moment, null);
});

test('plain bronze awards are not celebrated, first-time ones are', () => {
  assert.equal(pickAchievementMoment({ ...base, records: [], awards: [award('count_5', 'bronze')] }), null);
  const first = pickAchievementMoment({ ...base, records: [], awards: [award('first_interval', 'bronze')] });
  assert.equal(first?.kicker, 'Milestone');
  assert.equal(first?.label, 'Interval Workout');
});

test('the highest-tier award wins', () => {
  const moment = pickAchievementMoment({
    ...base,
    records: [],
    awards: [award('count_20', 'silver'), award('dist_100mi', 'gold')],
  });
  assert.equal(moment?.id, 'dist_100mi');
  assert.equal(moment?.value, '100');
  assert.equal(moment?.label, 'Miles Logged');
});

test('workout count awards show the count', () => {
  const moment = pickAchievementMoment({ ...base, records: [], awards: [award('count_20', 'silver')] });
  assert.equal(moment?.value, '20');
  assert.equal(moment?.label, 'Workouts Completed');
});
