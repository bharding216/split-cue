/**
 * Derive the runner's preferred pace unit from the device locale.
 *
 * Uses expo-localization's measurementSystem which returns:
 *   'us'     → United States (miles)
 *   'uk'     → United Kingdom (miles for road distances)
 *   'metric' → everywhere else (kilometers)
 *
 * Falls back to 'minPerMile' if the locale can't be read (matches the
 * existing hardcoded default so no behaviour changes for current users).
 */

import type { PaceUnit } from '../pace/paceTypes';

let _cached: PaceUnit | null = null;

export function localeDefaultPaceUnit(): PaceUnit {
  if (_cached) return _cached;
  try {
    const { getLocales } = require('expo-localization') as typeof import('expo-localization');
    const locale = getLocales()[0];
    const system = locale?.measurementSystem;
    _cached = system === 'metric' ? 'minPerKm' : 'minPerMile';
  } catch {
    _cached = 'minPerMile';
  }
  return _cached;
}
