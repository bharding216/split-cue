import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSample, advanceOdometer } from './paceTracker';
import { createOdometer, createPaceState, type GpsSample } from './paceTypes';

const START_TS = 1_700_000_000_000;
const START_LAT = 29.4848;
const START_LNG = -98.4747;
const METERS_PER_DEG_LAT = 111_195;

/** Deterministic noise in [-1, 1]. */
function noise(i: number, salt: number): number {
  return Math.sin(i * 12.9898 + salt * 78.233) * 0.999;
}

/**
 * One fix per second running due north at `trueMps`, reporting `reportedMps`,
 * with up to `jitterM` meters of position noise.
 */
function track(seconds: number, trueMps: number, reportedMps: number, jitterM = 3): GpsSample[] {
  const lngScale = METERS_PER_DEG_LAT * Math.cos((START_LAT * Math.PI) / 180);
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    latitude: START_LAT + (trueMps * i + jitterM * noise(i, 1)) / METERS_PER_DEG_LAT,
    longitude: START_LNG + (jitterM * noise(i, 2)) / lngScale,
    timestamp: START_TS + i * 1000,
    accuracy: 5,
    speed: reportedMps,
    altitude: null,
    altitudeAccuracy: null,
  }));
}

function odometerMeters(samples: GpsSample[]): number {
  let odometer = createOdometer();
  let total = 0;
  for (const sample of samples) {
    const step = advanceOdometer(odometer, sample);
    odometer = step.odometer;
    total += step.meters;
  }
  return total;
}

test('tops up distance when the phone under-reports speed', () => {
  const trueMeters = 2.7 * 600;
  const meters = odometerMeters(track(600, 2.7, 2.7 * 0.85));
  assert.ok(meters > trueMeters * 0.88, `got ${meters.toFixed(0)} m of ${trueMeters} m`);
  assert.ok(meters <= trueMeters * 1.01, `got ${meters.toFixed(0)} m of ${trueMeters} m`);
});

test('leaves accurate speed-based distance alone', () => {
  const trueMeters = 2.7 * 600;
  const meters = odometerMeters(track(600, 2.7, 2.7));
  assert.ok(Math.abs(meters - trueMeters) < trueMeters * 0.01, `got ${meters.toFixed(0)} m`);
});

test('does not count position jitter while standing still', () => {
  const meters = odometerMeters(track(300, 0, 0));
  assert.ok(meters < 5, `got ${meters.toFixed(1)} m`);
});

test('live pace is not slower than the position-based floor', () => {
  let state = createPaceState();
  for (const sample of track(60, 2.7, 2.7 * 0.8)) state = addSample(state, sample, 30);
  assert.ok(state.currentPaceMps != null);
  assert.ok(state.currentPaceMps > 2.7 * 0.85, `got ${state.currentPaceMps.toFixed(2)} m/s`);
  assert.ok(state.currentPaceMps < 2.7 * 1.05, `got ${state.currentPaceMps.toFixed(2)} m/s`);
});
