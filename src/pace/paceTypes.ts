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
}

/** How often to announce pace (seconds, 0 = off). */
export type PaceCueFrequency = 0 | 15 | 30 | 45 | 60 | 90 | 120;

/** Whether a periodic cue fires on elapsed time or covered distance. */
export type CueBasis = 'time' | 'distance';

/**
 * Distance step for periodic cues.
 * Resolved to meters from the pace unit: quarter / half / full mile, or 250 m / 500 m / 1 km.
 */
export type CueDistancePreset = 'off' | 'quarter' | 'half' | 'full';

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
  };
}
