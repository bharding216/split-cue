/**
 * Types for heart rate recording from Bluetooth LE heart rate monitors.
 */

/** One heart rate reading captured during a workout. */
export interface HrSample {
  /** Workout time when the reading arrived, excluding pauses (ms). */
  t: number;
  /** Wall-clock time of the reading (epoch ms), for matching against GPS fixes. */
  ts: number;
  bpm: number;
}

/** The heart rate monitor the runner paired in settings. */
export interface PairedHrDevice {
  id: string;
  name: string;
}

/** A heart rate monitor found while scanning. */
export interface DiscoveredHrDevice {
  id: string;
  name: string;
  rssi: number | null;
}

/**
 * Connection to the paired monitor.
 * `lost` means it dropped mid-session and reconnection is being retried.
 */
export type HrConnection = 'off' | 'connecting' | 'connected' | 'lost';

/**
 * Heart rate summary saved with a completed workout. The readings themselves
 * are kept in a separate file per run (see hrSampleStore).
 */
export interface WorkoutHeartRate {
  avg: number;
  max: number;
  deviceName?: string;
  /** Readings saved for the run, at most one per second. */
  sampleCount: number;
}

/** Readings outside this range are sensor noise, not a runner's heart rate. */
export const MIN_VALID_BPM = 30;
export const MAX_VALID_BPM = 240;

/** A longer gap between readings is a dropout: not drawn and not counted toward averages. */
export const HR_MAX_GAP_MS = 10_000;
