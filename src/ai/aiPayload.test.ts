import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistorySummary, serializeHistorySummary } from './historySummary';
import { buildCompletedWorkoutPayload } from './runPayload';
import type { CompletedWorkout } from '../workout/workoutTypes';

const HR_KEY = /heart|bpm|hr[A-Z_]|Hr\b|Hr[A-Z]|^hr$/;

const run: CompletedWorkout = {
  id: 'run1',
  workoutId: 'w1',
  workoutName: 'Speed 6x400',
  completedAt: Date.now() - 60_000,
  totalDurationMs: 30 * 60_000,
  totalDistanceMeters: 5000,
  splits: [
    {
      label: 'Fast',
      type: 'hard',
      plannedDurationSec: 90,
      actualDurationMs: 90_000,
      distanceMeters: 400,
      avgPaceMinPerMile: 6.5,
      avgPaceMinPerKm: 4.04,
      targetPace: undefined,
      effort: 8,
      avgHr: 177,
      maxHr: 188,
      hrRecoveryDrop: 31,
    },
  ],
  heartRate: { avg: 171, max: 188, deviceName: 'Polar H10 8A2B', sampleCount: 1800 },
};

function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysOf(v, out);
    }
  }
  return out;
}

test('analyze-workout payload carries no heart rate', () => {
  const payload = buildCompletedWorkoutPayload(run);
  assert.deepEqual(keysOf(payload).filter((k) => HR_KEY.test(k)), []);
  assert.ok(!JSON.stringify(payload).includes('Polar'));
  assert.equal(payload.splits?.length, 1);
});

test('history summary for the AI coach carries no heart rate', () => {
  const summary = buildHistorySummary([run]);
  assert.deepEqual(keysOf(summary).filter((k) => HR_KEY.test(k)), []);
  const text = serializeHistorySummary(summary) ?? '';
  assert.ok(!/heart|bpm|Polar/i.test(text));
});
