/**
 * Pure functions for GPS pace calculation.
 *
 * No React, no side effects — just math on GPS samples.
 * Uses the Haversine formula for distance between coordinates
 * and a rolling time-window for pace smoothing.
 */

import {
  GpsSample,
  PaceState,
  PaceWindowSize,
  MAX_ACCURACY_METERS,
  MIN_SAMPLES_FOR_PACE,
  MIN_PACE_SPAN_SECONDS,
  Odometer,
  createPaceState,
} from './paceTypes';

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_MILE = 1_609.344;
const METERS_PER_KM = 1_000;
/** Reported speed below this counts as standing still (a slow walk is ~1 m/s). */
const MOVING_SPEED_MPS = 0.5;

/** Convert degrees to radians. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance between two GPS points in meters. */
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Add a GPS sample and recompute pace.
 * Returns a new PaceState (immutable).
 */
export function addSample(
  state: PaceState,
  sample: GpsSample,
  windowSeconds: PaceWindowSize,
): PaceState {
  // Reject noisy samples
  if (sample.accuracy > MAX_ACCURACY_METERS) return state;

  const samples = [...state.samples, sample];
  const { odometer, meters } = advanceOdometer(state.odometer, sample);

  // Compute rolling-window pace
  const pace = computeRollingPace(samples, windowSeconds, sample.timestamp);

  // Prune old samples (keep 2× the window to avoid edge effects)
  const pruneCutoff = sample.timestamp - windowSeconds * 2 * 1000;
  const prunedSamples = samples.filter((s) => s.timestamp >= pruneCutoff);

  return {
    samples: prunedSamples,
    currentPaceMps: pace.paceMps,
    currentPaceMinPerMile: pace.paceMinPerMile,
    currentPaceMinPerKm: pace.paceMinPerKm,
    totalDistanceMeters: state.totalDistanceMeters + meters,
    odometer,
  };
}

/** Longest gap between fixes over which their reported speeds stand in for the path. */
const MAX_SPEED_GAP_MS = 5_000;
/** In fallback mode, movement under this (or the two fixes' combined accuracy) counts as position jitter. */
const MIN_JITTER_METERS = 5;

function hasSpeed(s: GpsSample): s is GpsSample & { speed: number } {
  return s.speed != null && s.speed >= 0;
}

/**
 * Distance covered since the previous fix.
 *
 * Summing straight lines between fixes counts position jitter (a few meters
 * per fix) as movement, which inflates distance badly at walking pace. When
 * the device reports speed, integrate it over time instead, like the live
 * pace does. Otherwise, or across a GPS gap, count straight-line distance
 * from the last counted fix only once it exceeds both fixes' accuracy.
 */
export function advanceOdometer(
  odo: Odometer,
  sample: GpsSample,
): { odometer: Odometer; meters: number } {
  const speedReported = odo.speedReported || (sample.speed != null && sample.speed > 0);
  const { prev } = odo;
  if (!prev) {
    return { odometer: { prev: sample, anchor: sample, speedReported }, meters: 0 };
  }

  const dtMs = sample.timestamp - prev.timestamp;
  if (
    speedReported &&
    dtMs > 0 &&
    dtMs <= MAX_SPEED_GAP_MS &&
    hasSpeed(prev) &&
    hasSpeed(sample)
  ) {
    const meters = ((prev.speed + sample.speed) / 2) * (dtMs / 1000);
    return { odometer: { prev: sample, anchor: sample, speedReported }, meters };
  }

  const anchor = odo.anchor ?? prev;
  const straight = haversineMeters(anchor, sample);
  if (straight > Math.max(anchor.accuracy + sample.accuracy, MIN_JITTER_METERS)) {
    return { odometer: { prev: sample, anchor: sample, speedReported }, meters: straight };
  }
  return { odometer: { prev: sample, anchor, speedReported }, meters: 0 };
}

/**
 * Clear the current pace once the newest accepted sample is older than the
 * window, so a lost GPS signal isn't reported as a frozen pace.
 * Returns the same object when nothing changes.
 */
export function expireStalePace(
  state: PaceState,
  now: number,
  windowSeconds: PaceWindowSize,
): PaceState {
  if (state.currentPaceMps == null) return state;
  const newest = state.samples[state.samples.length - 1];
  if (newest && now - newest.timestamp <= windowSeconds * 1000) return state;
  return {
    ...state,
    currentPaceMps: null,
    currentPaceMinPerMile: null,
    currentPaceMinPerKm: null,
  };
}

/**
 * Mean of the OS-reported (Doppler) speeds, which aren't affected by position
 * jitter. Null when the device doesn't report speed: iOS uses negative values
 * for invalid, and some Android providers report 0 for every fix.
 *
 * Fixes before the first moving one are skipped: standing at Start or after a
 * long stop would otherwise drag the pace down for a whole window. Stops later
 * in the window still count.
 */
function averageReportedSpeed(samples: GpsSample[]): number | null {
  const firstMoving = samples.findIndex(
    (s) => s.speed != null && s.speed >= MOVING_SPEED_MPS,
  );
  if (firstMoving < 0) return null;
  const speeds = samples
    .slice(firstMoving)
    .map((s) => s.speed)
    .filter((v): v is number => v != null && v >= 0);
  if (speeds.length < MIN_SAMPLES_FOR_PACE || !speeds.some((v) => v > 0)) {
    return null;
  }
  return speeds.reduce((sum, v) => sum + v, 0) / speeds.length;
}

/** Compute pace over a rolling time window. */
function computeRollingPace(
  samples: GpsSample[],
  windowSeconds: number,
  now: number,
): {
  paceMps: number | null;
  paceMinPerMile: number | null;
  paceMinPerKm: number | null;
} {
  const cutoff = now - windowSeconds * 1000;
  const windowSamples = samples.filter(
    (s) => s.timestamp >= cutoff && s.accuracy <= MAX_ACCURACY_METERS,
  );

  if (windowSamples.length < MIN_SAMPLES_FOR_PACE) {
    return { paceMps: null, paceMinPerMile: null, paceMinPerKm: null };
  }

  const elapsed =
    (windowSamples[windowSamples.length - 1].timestamp -
      windowSamples[0].timestamp) /
    1000;

  // Position jitter is a fixed few meters per fix, so over a short span it
  // dominates the distance and reads as a sprint until the window fills.
  if (elapsed < Math.min(MIN_PACE_SPAN_SECONDS, windowSeconds / 2)) {
    return { paceMps: null, paceMinPerMile: null, paceMinPerKm: null };
  }

  let mps = averageReportedSpeed(windowSamples);
  if (mps == null) {
    let distance = 0;
    for (let i = 1; i < windowSamples.length; i++) {
      distance += haversineMeters(windowSamples[i - 1], windowSamples[i]);
    }
    if (distance < 1) {
      return { paceMps: null, paceMinPerMile: null, paceMinPerKm: null };
    }
    mps = distance / elapsed;
  }

  // Guard against unrealistically slow or fast readings
  if (mps < 0.3 || mps > 15) {
    return { paceMps: null, paceMinPerMile: null, paceMinPerKm: null };
  }

  const minPerMile = METERS_PER_MILE / mps / 60;
  const minPerKm = METERS_PER_KM / mps / 60;

  return { paceMps: mps, paceMinPerMile: minPerMile, paceMinPerKm: minPerKm };
}

/** Format a pace value (decimal minutes) into "M:SS" display string. */
export function formatPaceDisplay(paceMinutes: number | null): string {
  if (paceMinutes == null || !isFinite(paceMinutes)) return '--:--';
  const total = Math.round(paceMinutes * 60);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Format a pace value into speech-friendly text. */
export function formatPaceForSpeech(paceMinutes: number | null): string {
  if (paceMinutes == null || !isFinite(paceMinutes)) return 'unavailable';
  const total = Math.round(paceMinutes * 60);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (secs === 0) {
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  }
  return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ${secs} ${secs === 1 ? 'second' : 'seconds'}`;
}

/** Format total distance for display. */
export function formatDistance(meters: number, unit: 'minPerMile' | 'minPerKm'): string {
  if (unit === 'minPerMile') {
    const miles = meters / METERS_PER_MILE;
    return `${miles.toFixed(2)} mi`;
  }
  const km = meters / METERS_PER_KM;
  return `${km.toFixed(2)} km`;
}

/** Reset pace state (e.g. when starting a new workout). */
export function resetPaceState(): PaceState {
  return createPaceState();
}
