/**
 * Periodic audio cues can fire on elapsed time or on distance covered.
 * Distance steps follow the runner's pace unit.
 */

import type { CueDistancePreset, PaceUnit, ProgressCueBasis } from '../pace/paceTypes';
import { METERS_PER_KM, METERS_PER_MILE } from '../workout/workoutTypes';

export const CUE_DISTANCE_PRESETS: CueDistancePreset[] = ['off', 'quarter', 'half', 'full'];

export function cueDistanceMeters(preset: CueDistancePreset, unit: PaceUnit): number {
  if (preset === 'off') return 0;
  if (unit === 'minPerKm') {
    if (preset === 'quarter') return 250;
    if (preset === 'half') return 500;
    return METERS_PER_KM;
  }
  if (preset === 'quarter') return METERS_PER_MILE / 4;
  if (preset === 'half') return METERS_PER_MILE / 2;
  return METERS_PER_MILE;
}

export function cueDistanceLabel(preset: CueDistancePreset, unit: PaceUnit): string {
  if (preset === 'off') return 'Off';
  if (unit === 'minPerKm') {
    if (preset === 'quarter') return '250m';
    if (preset === 'half') return '500m';
    return '1 km';
  }
  if (preset === 'quarter') return '¼ mi';
  if (preset === 'half') return '½ mi';
  return '1 mi';
}

/**
 * Latest step boundary crossed since `lastMark`, or null.
 * `elapsed` and `step` share a unit (seconds or meters).
 * A late tick that skips several boundaries returns only the newest one.
 */
export function nextCueMark(elapsed: number, step: number, lastMark: number): number | null {
  if (!(step > 0) || !(elapsed >= step)) return null;
  const mark = Math.floor(elapsed / step);
  if (mark > lastMark) return mark;
  return null;
}

export function paceCuesEnabled(settings: {
  paceCueBasis: ProgressCueBasis;
  paceCueDistance: CueDistancePreset;
  paceCueFrequency: number;
}): boolean {
  const byDistance = settings.paceCueDistance !== 'off';
  const byTime = settings.paceCueFrequency > 0;
  if (settings.paceCueBasis === 'distance') return byDistance;
  if (settings.paceCueBasis === 'time') return byTime;
  return byDistance || byTime;
}

/**
 * Interval-progress distance cues need GPS even when pace display is off.
 * 'auto' only speaks distance in distance intervals, which start GPS on their own.
 */
export function distanceProgressCuesNeedGps(settings: {
  progressCueBasis: ProgressCueBasis;
  progressCueDistance: CueDistancePreset;
}): boolean {
  return settings.progressCueBasis === 'distance' && settings.progressCueDistance !== 'off';
}
