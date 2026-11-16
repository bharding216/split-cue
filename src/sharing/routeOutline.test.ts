import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RoutePoint } from '../workout/workoutTypes';
import { routeToSvgPath, trimRouteForPrivacy } from './routeOutline';

function line(meters: number, step = 50): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (let d = 0; d <= meters; d += step) {
    points.push({ lat: 40 + d / 111_000, lng: -75, alt: null, ts: d, dist: d });
  }
  return points;
}

test('trims the start and end of a route', () => {
  const trimmed = trimRouteForPrivacy(line(2000));
  assert.equal(trimmed[0].dist, 200);
  assert.equal(trimmed[trimmed.length - 1].dist, 1800);
});

test('short routes are dropped rather than drawn untrimmed', () => {
  assert.deepEqual(trimRouteForPrivacy(line(500)), []);
  assert.deepEqual(trimRouteForPrivacy([]), []);
});

test('svg path stays inside the box', () => {
  const path = routeToSvgPath(line(2000), 100, 60, 4);
  assert.ok(path.startsWith('M'));
  const coords = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  for (let i = 0; i < coords.length; i += 2) {
    assert.ok(coords[i] >= 4 && coords[i] <= 96);
    assert.ok(coords[i + 1] >= 4 && coords[i + 1] <= 56);
  }
});

test('a route with no extent has no path', () => {
  assert.equal(routeToSvgPath([{ lat: 1, lng: 1 }, { lat: 1, lng: 1 }], 100, 100), '');
});
