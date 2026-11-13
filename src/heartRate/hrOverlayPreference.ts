/**
 * Whether Run Details draws heart rate over the elevation profile.
 * Off until the runner turns it on, then remembered for later runs.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@pacecue/hr_elevation_overlay';

export async function loadHrOverlayEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function saveHrOverlayEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {}
}
