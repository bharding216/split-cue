import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Colors } from '../constants/theme';
import type { IntervalSplit, RoutePoint } from '../workout/workoutTypes';
import {
  generatePaceprint,
  binRouteIntoPaces,
  paceprintToEmoji,
  TILE_COUNT,
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

// ── 20-tile system ───────────────────────────────────────────────────

test('easy run: even splits produce mostly-purple tiles', () => {
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
  assert.equal(data.cells.length, TILE_COUNT);
  // All tiles should be uniform height.
  for (const cell of data.cells) {
    assert.equal(cell.height, 1);
  }
  // Even splits → mostly purple (near typical).
  const purpleCount = data.cells.filter((c) => c.color === Colors.paceprintTypical).length;
  assert.ok(purpleCount >= TILE_COUNT * 0.8, `expected mostly purple, got ${purpleCount}/${TILE_COUNT}`);
});

test('uses blue/purple/pink color scheme', () => {
  const validColors = new Set([Colors.paceprintSlow, Colors.paceprintTypical, Colors.paceprintFast]);
  const splits = Array.from({ length: 6 }, (_, i) =>
    makeSplit({
      label: `Mile ${i + 1}`,
      segmentType: 'run',
      avgPaceMinPerMile: 7.0 + i * 0.6,
      targetPace: undefined,
    }),
  );
  const data = generatePaceprint(
    { totalDurationMs: 36 * 60_000, totalDistanceMeters: 6 * 1609, splits },
    'tempo',
  );
  for (const cell of data.cells) {
    assert.ok(validColors.has(cell.color), `unexpected color ${cell.color}`);
  }
});

// ── Intervals ────────────────────────────────────────────────────────

test('intervals: produces 20 tiles with color variation', () => {
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
  assert.equal(data.cells.length, TILE_COUNT);

  // Should have multiple colors due to pace variation between work/recovery.
  const colors = new Set(data.cells.map((c) => c.color));
  assert.ok(colors.size >= 2, 'intervals should produce at least 2 different colors');
});

// ── Tempo ────────────────────────────────────────────────────────────

test('tempo: gradual fade shows color progression', () => {
  const splits = Array.from({ length: 5 }, (_, i) =>
    makeSplit({
      label: `Mile ${i + 1}`,
      segmentType: 'run',
      avgPaceMinPerMile: 7.5 + i * 0.2,
      targetPace: 7.5,
    }),
  );
  const data = generatePaceprint(
    { totalDurationMs: 38 * 60_000, totalDistanceMeters: 5 * 1609, splits },
    'tempo',
  );
  assert.equal(data.category, 'tempo');
  assert.equal(data.cells.length, TILE_COUNT);
});

// ── Long run ─────────────────────────────────────────────────────────

test('long run: produces 20 tiles', () => {
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
  assert.equal(data.cells.length, TILE_COUNT);
});

// ── Race ─────────────────────────────────────────────────────────────

test('race: 20 tiles with a final kick', () => {
  const splits = Array.from({ length: 5 }, (_, i) =>
    makeSplit({
      label: `KM ${i + 1}`,
      segmentType: 'run',
      avgPaceMinPerMile: i === 4 ? 6.5 : 7.5,
      targetPace: undefined,
    }),
  );
  const data = generatePaceprint(
    { totalDurationMs: 22 * 60_000, totalDistanceMeters: 5000, splits },
    'race',
  );
  assert.equal(data.category, 'race');
  assert.equal(data.cells.length, TILE_COUNT);
  // Last tiles should be pink (faster) due to the kick.
  const lastTile = data.cells[data.cells.length - 1];
  assert.equal(lastTile.color, Colors.paceprintFast, 'final kick should be pink');
});

// ── Free run (GPS fallback) ──────────────────────────────────────────

test('free run with no splits uses GPS bins', () => {
  const route = makeLine(5, 30 * 60_000);
  const data = generatePaceprint(
    { totalDurationMs: 30 * 60_000, totalDistanceMeters: 5000, route, splits: [] },
    'other',
  );
  assert.ok(data.cells.length >= 10, `expected >= 10 bins, got ${data.cells.length}`);
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
  assert.ok(data.cells.length >= 10, `expected >= 10 bins from GPS, got ${data.cells.length}`);
});

// ── binRouteIntoPaces ────────────────────────────────────────────────

test('binRouteIntoPaces splits a straight route into bins', () => {
  const route = makeLine(5, 30 * 60_000);
  const bins = binRouteIntoPaces(route, 30 * 60_000, 20);
  assert.ok(bins.length >= 15 && bins.length <= 20, `expected ~20 bins, got ${bins.length}`);
  for (const bin of bins) {
    assert.ok(bin.paceMinPerMile > 5 && bin.paceMinPerMile < 15, `pace ${bin.paceMinPerMile} out of range`);
  }
});

test('empty route yields no bins', () => {
  assert.deepEqual(binRouteIntoPaces([], 0), []);
});

// ── paceprintToEmoji ─────────────────────────────────────────────────

test('emoji encoding uses blue/purple/pink', () => {
  const cells: PaceprintCell[] = [
    { color: Colors.paceprintSlow, height: 1, weight: 0.25 },
    { color: Colors.paceprintTypical, height: 1, weight: 0.25 },
    { color: Colors.paceprintFast, height: 1, weight: 0.25 },
    { color: Colors.paceprintTypical, height: 1, weight: 0.25 },
  ];
  const emoji = paceprintToEmoji({ cells, category: 'intervals' });
  assert.equal(emoji, '🟦🟪🟥🟪');
});

// ── Edge cases ───────────────────────────────────────────────────────

test('no splits and no route produces a single fallback cell', () => {
  const data = generatePaceprint(
    { totalDurationMs: 10_000, totalDistanceMeters: 100, splits: [], route: [] },
    'other',
  );
  assert.equal(data.cells.length, 1);
  assert.equal(data.cells[0].color, Colors.paceprintTypical);
});

test('weight normalization: weights sum to 1', () => {
  const splits = Array.from({ length: 6 }, () => makeSplit());
  const data = generatePaceprint(
    { totalDurationMs: 18 * 60_000, totalDistanceMeters: 4800, splits },
    'easy',
  );
  const total = data.cells.reduce((s, c) => s + c.weight, 0);
  assert.ok(Math.abs(total - 1) < 0.001, `weights should sum to 1, got ${total}`);
});

test('all tiles have height 1', () => {
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
  for (const cell of data.cells) {
    assert.equal(cell.height, 1, 'all tiles should have height 1');
  }
});
