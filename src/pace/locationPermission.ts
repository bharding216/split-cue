/**
 * Location permission helpers for GPS pace tracking.
 *
 * Foreground access is requested from the pre-run screen, never after the
 * workout timer has started. Background ("Always") access is offered once on
 * the pre-run screen after foreground access is granted, and once on the
 * finish screen after a run that used GPS.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { isWorkoutSessionSupported } from '../../modules/workout-session';

/** Where background access is offered: before a run, and again on the finish screen. */
export type BackgroundOfferPlacement = 'preRun' | 'finished';

const BACKGROUND_OFFER_DISMISSED_KEYS: Record<BackgroundOfferPlacement, string> = {
  preRun: '@pacecue/background_location_prerun_offer_dismissed',
  finished: '@pacecue/background_location_offer_dismissed',
};

/** `askable`: a system prompt can still be shown. `blocked`: only Settings can change it. */
export type LocationAccess = 'granted' | 'askable' | 'blocked';

function toAccess(response: Location.PermissionResponse): LocationAccess {
  if (response.granted) return 'granted';
  return response.canAskAgain ? 'askable' : 'blocked';
}

export async function getForegroundLocationAccess(): Promise<LocationAccess> {
  return toAccess(await Location.getForegroundPermissionsAsync());
}

export async function requestForegroundLocationAccess(): Promise<LocationAccess> {
  return toAccess(await Location.requestForegroundPermissionsAsync());
}

export async function shouldOfferBackgroundLocation(
  placement: BackgroundOfferPlacement,
): Promise<boolean> {
  // The Android workout session tracks with the screen locked using foreground
  // access, and those builds don't declare background location at all.
  if (isWorkoutSessionSupported) return false;
  if (await AsyncStorage.getItem(BACKGROUND_OFFER_DISMISSED_KEYS[placement])) return false;
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return false;
  const background = await Location.getBackgroundPermissionsAsync();
  return !background.granted && background.canAskAgain;
}

export async function requestBackgroundLocationAccess(
  placement: BackgroundOfferPlacement,
): Promise<boolean> {
  await AsyncStorage.setItem(BACKGROUND_OFFER_DISMISSED_KEYS[placement], '1');
  const { granted } = await Location.requestBackgroundPermissionsAsync();
  return granted;
}

export async function dismissBackgroundLocationOffer(
  placement: BackgroundOfferPlacement,
): Promise<void> {
  await AsyncStorage.setItem(BACKGROUND_OFFER_DISMISSED_KEYS[placement], '1');
}
