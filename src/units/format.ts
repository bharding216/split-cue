/**
 * Display formatting for distances and paces in the runner's chosen unit.
 *
 * Stored values stay in meters and min/mile; convert only when rendering.
 */

import type { PaceUnit } from '../pace/paceTypes';
import { METERS_PER_KM, METERS_PER_MILE, formatDistanceForSpeech } from '../workout/workoutTypes';
import { paceToUnit, paceUnitSuffix, splitPace } from '../workout/goalPaceSuggestions';

export { paceToUnit, paceUnitSuffix as paceSuffix };

export function metersPerUnit(unit: PaceUnit): number {
  return unit === 'minPerKm' ? METERS_PER_KM : METERS_PER_MILE;
}

/** Short distance label: "mi" or "km". */
export function distanceUnitLabel(unit: PaceUnit): string {
  return unit === 'minPerKm' ? 'km' : 'mi';
}

/** Long, capitalized plural: "Miles" or "Kilometers". */
export function distanceUnitName(unit: PaceUnit): string {
  return unit === 'minPerKm' ? 'Kilometers' : 'Miles';
}

/** Pace label for chart titles and headers: "min/mi" or "min/km". */
export function paceUnitLabel(unit: PaceUnit): string {
  return unit === 'minPerKm' ? 'min/km' : 'min/mi';
}

export function toDisplayDistance(meters: number, unit: PaceUnit): number {
  return meters / metersPerUnit(unit);
}

/** "3.10 mi" / "5.00 km"; falls back to meters below 0.1 of a unit. */
export function formatDistance(meters: number, unit: PaceUnit): string {
  const value = toDisplayDistance(meters, unit);
  if (value < 0.1) return `${Math.round(meters)} m`;
  return `${value.toFixed(2)} ${distanceUnitLabel(unit)}`;
}

/** Like formatDistance, but drops ".00" for whole numbers ("2 mi", "0.50 mi"). */
export function formatDistanceCompact(meters: number, unit: PaceUnit): string {
  const value = toDisplayDistance(meters, unit);
  const label = distanceUnitLabel(unit);
  if (Math.abs(value - Math.round(value)) < 0.005) return `${Math.round(value)} ${label}`;
  return `${value.toFixed(2)} ${label}`;
}

/**
 * Friendly segment distance for workout structure rows.
 * Miles keep the spoken wording ("half mile", "400 meters", "5 K");
 * kilometers use "400 m" under 1 km, then trimmed km ("1.5 km").
 */
export function formatSegmentDistance(meters: number, unit: PaceUnit): string {
  if (unit === 'minPerMile') return formatDistanceForSpeech(meters);
  if (Math.abs(meters - 21097) < 100) return 'half marathon';
  if (Math.abs(meters - 42195) < 200) return 'marathon';
  if (meters < METERS_PER_KM) return `${Math.round(meters)} m`;
  const km = Math.round((meters / METERS_PER_KM) * 100) / 100;
  return `${km} km`;
}

/** "8:05" for a min/mile pace shown in `unit`; "--:--" when missing. */
export function formatPaceValue(paceMinPerMile: number | null | undefined, unit: PaceUnit): string {
  if (paceMinPerMile == null || !isFinite(paceMinPerMile) || paceMinPerMile <= 0) return '--:--';
  const { min, sec } = splitPace(paceToUnit(paceMinPerMile, unit));
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/** "8:05/mi" or "5:01/km" for a min/mile pace. */
export function formatPace(paceMinPerMile: number | null | undefined, unit: PaceUnit): string {
  return `${formatPaceValue(paceMinPerMile, unit)}${paceUnitSuffix(unit)}`;
}
