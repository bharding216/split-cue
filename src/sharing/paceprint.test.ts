import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Colors } from '../constants/theme';
import type { IntervalSplit, RoutePoint } from '../workout/workoutTypes';
import {
  generatePaceprint,
  binRouteIntoPaces,
  paceprintToEmoji,
  type PaceprintCell,
} from './paceprint';

// ── Helpers ──────────────────────────────────────────────────────────

function makeSplit(overrides: Partial<IntervalSplit> = {}): IntervalSplit {
  return {
    label: 'Run',
    type: 'hard',
    plannedDurationSec: 180,
    actualDurationMs: 180_000,
    distanceMeters: 800,
    avgPaceMinPerMile: 8.0,
    avgPaceMinPerKm: 4.97,
    targetPace: 8.0,
    effort: 7,
    segmentType: 'run',
    ...overrides,
  };
}

function makeRecoverySplit(overrides: Partial<IntervalSplit> = {}): IntervalSplit {
  return makeSplit({
    label: 'Recovery',
    type: 'easy',
    segmentType: 'recovery',
    actualDurationMs: 90_000,
    distanceMeters: 300,
    avgPaceMinPerMile: 12.0,
    targetPace: undefined,
    effort: 3,
    ...overrides,
  });
}

function makeWarmupSplit(): IntervalSplit {
  return makeSplit({
    label: 'Warm Up',
    type: 'warmup',
    segmentType: 'warmup',
    actualDurationMs: 300_000,
    distanceMeters: 1200,
    avgPaceMinPerMile: 10.0,
    targetPace: undefined,
    effort: 3,
  });
}

function makeCooldownSplit(): IntervalSplit {
  return makeSplit({
    label: 'Cool Down',
    type: 'cooldown',
    segmentType: 'cooldown',
    actualDurationMs: 300_000,
    distanceMeters: 1200,
    avgPaceMinPerMile: 10.5,
    targetPace: undefined,
    effort: 2,
  });
}

function makeLine(km: number, durationMs: number): RoutePoint[] {
  const points: RoutePoint[] = [];
  const meters = km * 1000;
  const step = 50;
  for (let d = 0; d <= meters; d += step) {
    const frac = d / meters;
    points.push({
      lat: 40 + d / 111_000,
      lng: -75,
      alt: null,
      ts: frac * durationMs,
      dist: d,
    });
  }
  return points;
}

// ── Easy run ─────────────────────────────────────────────────────────

test('easy run: even splits produce all-green cells', () => {
  const splits = Array.from({ length: 6 }, (_, i) =>
    makeSplit({
      label: `Mile ${i + 1}`,
      segmentType: 'run',
      avgPaceMinPerMile: 9.0 + Math.random() * 0.05,
      targetPace: undefined,
    }),
  );
  const data = generatePaceprint(
    { totalDurationMs: 36 * 60_000, totalDistanceMeters: 6 * 1609, splits },
    'easy',
  );
  assert.equal(data.category, 'easy');
  assert.equal(data.cells.length, 6);
  // All work cells, heights are the same (all normalized to 1).
  for (const cell of data.cells) {
    assert.equal(cell.shape, 'work');
    assert.ok(cell.height >= 0.9, `height ${cell.height} should be near 1`);
  }
});

// ── Intervals ────────────────────────────────────────────────────────

test('intervals: alternating tall/short pattern', () => {
  const splits: IntervalSplit[] = [
    makeWarmupSplit(),
    makeSplit({ avgPaceMinPerMile: 7.0, targetPace: 7.0 }),
    makeRecoverySplit(),
    makeSplit({ avgPaceMinPerMile: 7.1, targetPace: 7.0 }),
    makeRecoverySplit(),
    makeSplit({ avgPaceMinPerMile: 7.2, targetPace: 7.0 }),
    makeRecoverySplit(),
    makeCooldownSplit(),
  ];
  const data = generatePaceprint(
    { totalDurationMs: 30 * 60_000, totalDistanceMeters: 5000, splits },
    'intervals',
  );
  assert.equal(data.category, 'intervals');
  assert.equal(data.cells.length, 8);

  // Work cells should be taller than recovery cells.
  const workCells = data.cells.filter((c) => c.shape === 'work');
  const recoveryCells = data.cells.filter((c) => c.shape === 'recovery');
  assert.ok(workCells.length >= 3);
  assert.ok(recoveryCells.length >= 3);
  for (const rc of recoveryCells) {
    assert.ok(rc.height < workCells[0].height, 'recovery should be shorter than work');
  }
});

// ── Tempo ────────────────────────────────────────────────────────────

test('tempo: uniform blocks with fade detection', () => {
  const splits = Array.from({ length: 5 }, (_, i) =>
    makeSplit({
      label: `Mile ${i + 1}`,
      segmentType: 'run',
      avgPaceMinPerMile: 7.5 + i * 0.15, // gradual fade
      targetPace: 7.5,
    }),
  );
  const data = generatePaceprint(
    { totalDurationMs: 38 * 60_000, totalDistanceMeters: 5 * 1609, splits },
    'tempo',
  );
  assert.equal(data.category, 'tempo');
  assert.equal(data.cells.length, 5);

  // First split should be green (on target), last should be yellow or red (faded).
  assert.equal(data.cells[0].color, Colors.primary);
  assert.notEqual(data.cells[4].color, Colors.primary);
});

// ── Long run ─────────────────────────────────────────────────────────

test('long run: many blocks', () => {
  const splits = Array.from({ length: 13 }, (_, i) =>
    makeSplit({
      label: `Mile ${i + 1}`,
      segmentType: 'run',
      avgPaceMinPerMile: 9.0 + i * 0.08,
      targetPace: undefined,
    }),
  );
  const data = generatePaceprint(
    { totalDurationMs: 120 * 60_000, totalDistanceMeters: 13 * 1609, splits },
    'long_run',
  );
  assert.equal(data.category, 'long_run');
  assert.equal(data.cells.length, 13);
  assert.ok(data.cells.every((c) => c.shape === 'work'));
});

// ── Race ─────────────────────────────────────────────────────────────

test('race: dense blocks with a final kick', () => {
  const splits = Array.from({ length: 5 }, (_, i) =>
    makeSplit({
      label: `KM ${i + 1}`,
      segmentType: 'run',
      avgPaceMinPerMile: i === 4 ? 6.5 : 7.0, // kick at the end
      targetPace: undefined,
    }),
  );
  const data = generatePaceprint(
    { totalDurationMs: 22 * 60_000, totalDistanceMeters: 5000, splits },
    'race',
  );
  assert.equal(data.category, 'race');
  assert.equal(data.cells.length, 5);
});

// ── Free run (GPS fallback) ──────────────────────────────────────────

test('free run with no splits uses GPS bins', () => {
  const route = makeLine(5, 30 * 60_000);
  const data = generatePaceprint(
    { totalDurationMs: 30 * 60_000, totalDistanceMeters: 5000, route, splits: [] },
    'other',
  );
  assert.ok(data.cells.length >= 5, `expected >= 5 bins, got ${data.cells.length}`);
  assert.ok(data.cells.every((c) => c.shape === 'work'));
});

test('free run with only 1 split falls back to GPS', () => {
  const route = makeLine(5, 30 * 60_000);
  const data = generatePaceprint(
    {
      totalDurationMs: 30 * 60_000,
      totalDistanceMeters: 5000,
      route,
      splits: [makeSplit({ actualDurationMs: 30 * 60_000, distanceMeters: 5000 })],
    },
    'other',
  );
  assert.ok(data.cells.length >= 5, `expected >= 5 bins from GPS, got ${data.cells.length}`);
});

// ── binRouteIntoPaces ────────────────────────────────────────────────

test('binRouteIntoPaces splits a straight route into bins', () => {
  const route = makeLine(5, 30 * 60_000);
  const bins = binRouteIntoPaces(route, 30 * 60_000, 10);
  assert.ok(bins.length >= 8 && bins.length <= 10, `expected ~10 bins, got ${bins.length}`);
  for (const bin of bins) {
    assert.ok(bin.paceMinPerMile > 5 && bin.paceMinPerMile < 15, `pace ${bin.paceMinPerMile} out of range`);
    assert.ok(bin.durationMs > 0);
  }
});

test('empty route yields no bins', () => {
  assert.deepEqual(binRouteIntoPaces([], 0), []);
});

// ── paceprintToEmoji ─────────────────────────────────────────────────

test('emoji encoding uses correct symbols', () => {
  const cells: PaceprintCell[] = [
    { color: Colors.primary, height: 1, shape: 'work', weight: 1 },
    { color: Colors.warning, height: 1, shape: 'work', weight: 1 },
    { color: Colors.danger, height: 1, shape: 'work', weight: 1 },
    { color: Colors.accent + '77', height: 0.5, shape: 'recovery', weight: 1 },
  ];
  const emoji = paceprintToEmoji({ cells, category: 'intervals' });
  assert.equal(emoji, '🟩🟨🟥🟦');
});

// ── Edge cases ───────────────────────────────────────────────────────

test('no splits and no route produces a single fallback cell', () => {
  const data = generatePaceprint(
    { totalDurationMs: 10_000, totalDistanceMeters: 100, splits: [], route: [] },
    'other',
  );
  assert.equal(data.cells.length, 1);
  assert.equal(data.cells[0].color, Colors.primary);
});

test('weight normalization sums to 1', () => {
  const splits = Array.from({ length: 4 }, () => makeSplit());
  const data = generatePaceprint(
    { totalDurationMs: 12 * 60_000, totalDistanceMeters: 3200, splits },
    'easy',
  );
  const total = data.cells.reduce((s, c) => s + c.weight, 0);
  assert.ok(Math.abs(total - 1) < 0.001, `weights should sum to 1, got ${total}`);
});

test('heights are normalized to max 1', () => {
  const splits: IntervalSplit[] = [
    makeWarmupSplit(),
    makeSplit(),
    makeRecoverySplit(),
    makeSplit(),
    makeCooldownSplit(),
  ];
  const data = generatePaceprint(
    { totalDurationMs: 20 * 60_000, totalDistanceMeters: 4000, splits },
    'intervals',
  );
  const maxH = Math.max(...data.cells.map((c) => c.height));
  assert.equal(maxH, 1, 'tallest cell should have height 1');
  assert.ok(data.cells.some((c) => c.height < 1), 'some cells should be shorter');
});
