/**
 * Types for GPS pace tracking.
 */

/** A single GPS reading captured during a workout. */
export interface GpsSample {
  latitude: number;
  longitude: number;
  timestamp: number; // epoch ms
  accuracy: number; // meters
  speed: number | null; // m/s from the OS
  altitude: number | null; // meters above sea level
  altitudeAccuracy: number | null; // vertical accuracy in meters
}

/** Rolling pace state maintained during a workout. */
export interface PaceState {
  samples: GpsSample[];
  /** Current pace in meters per second (null = insufficient data). */
  currentPaceMps: number | null;
  /** Current pace in min/mile (null = insufficient data). */
  currentPaceMinPerMile: number | null;
  /** Current pace in min/km (null = insufficient data). */
  currentPaceMinPerKm: number | null;
  /** Total distance covered in meters since workout start. */
  totalDistanceMeters: number;
  /** Bookkeeping for how distance accumulates between fixes. */
  odometer: Odometer;
}

/** Distance bookkeeping across fixes; see `advanceOdometer`. */
export interface Odometer {
  /** Previous accepted fix. */
  prev: GpsSample | null;
  /** Last fix at which straight-line distance was counted (fallback mode). */
  anchor: GpsSample | null;
  /** Whether this device has reported a positive speed during the track. */
  speedReported: boolean;
  /** Position-based floor under the counted distance. */
  check: PositionCheck;
}

/**
 * Fixes in the current span of the position check. The straight line between
 * consecutive spans' mean positions can't be longer than the path actually run,
 * so it bounds speed-based distance from below.
 */
export interface PositionCheck {
  startedAt: number | null;
  latSum: number;
  lngSum: number;
  count: number;
  /** Distance counted in this span. */
  meters: number;
  /** Mean position of the previous span. */
  prevCentroid: { latitude: number; longitude: number } | null;
}

export function createPositionCheck(): PositionCheck {
  return { startedAt: null, latSum: 0, lngSum: 0, count: 0, meters: 0, prevCentroid: null };
}

export function createOdometer(): Odometer {
  return { prev: null, anchor: null, speedReported: false, check: createPositionCheck() };
}

/** How often to announce pace (seconds, 0 = off). */
export type PaceCueFrequency = 0 | 15 | 30 | 45 | 60 | 90 | 120;

/** Whether a periodic cue fires on elapsed time or covered distance. */
export type CueBasis = 'time' | 'distance';

/**
 * Interval-progress cues can also follow each interval's goal: elapsed time in
 * timed intervals, distance plus elapsed time in distance intervals.
 */
export type ProgressCueBasis = CueBasis | 'auto';

/**
 * Distance step for periodic cues.
 * Resolved to meters from the pace unit: quarter / half / full mile, or 250 m / 500 m / 1 km.
 */
export type CueDistancePreset = 'off' | 'quarter' | 'half' | 'full';

/** Split length on Run Details, resolved like CueDistancePreset. */
export type SplitDistancePreset = Exclude<CueDistancePreset, 'off'>;

/** Rolling window size for pace calculation (seconds). */
export type PaceWindowSize = 10 | 30 | 60;

/** User preference for pace display units. */
export type PaceUnit = 'minPerMile' | 'minPerKm';

/** Maximum GPS accuracy (meters) to accept a sample. */
export const MAX_ACCURACY_METERS = 20;

/** Minimum samples required to compute pace. */
export const MIN_SAMPLES_FOR_PACE = 3;

/** Minimum time span (seconds) the window's samples must cover before a pace is reported. */
export const MIN_PACE_SPAN_SECONDS = 10;

export function createPaceState(): PaceState {
  return {
    samples: [],
    currentPaceMps: null,
    currentPaceMinPerMile: null,
    currentPaceMinPerKm: null,
    totalDistanceMeters: 0,
    odometer: createOdometer(),
  };
}
