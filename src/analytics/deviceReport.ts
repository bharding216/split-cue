/**
 * Keeps this install's row in the `devices` table current.
 *
 * Called on launch and when the app returns to the foreground. The snapshot is
 * only sent when something changed, or once a day so `last_seen_at` stays fresh.
 * Failures are swallowed, like `track()`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { isWorkoutSessionSupported } from '../../modules/workout-session';
import { supabase } from './supabaseClient';
import { deviceCountry, getAnonymousId } from './track';
import { getInstallReferrer, getInstallationTime, staticDeviceInfo } from './deviceInfo';
import { loadSettings, onSettingsSaved } from '../workout/workoutStorage';
import type { SubscriptionTier } from '../types/database';

const LAST_REPORT_KEY = '@pacecue/device_report';
const INSTALL_REFERRER_KEY = '@pacecue/install_referrer';
const REPORT_EVERY_MS = 24 * 60 * 60 * 1000;
const SETTINGS_DEBOUNCE_MS = 5000;

let inFlight: Promise<void> | null = null;
let rerunAfterFlight = false;
let settingsTimer: ReturnType<typeof setTimeout> | null = null;
/** Set by the first reportDevice() call, once auth and subscription state are known. */
let lastArgs: { userId: string | null; subscriptionTier: SubscriptionTier | null } | null = null;

async function locationPermissions() {
  try {
    // Android builds with the workout session don't declare background location,
    // and expo-location throws when asked about an undeclared permission.
    const [foreground, background] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      isWorkoutSessionSupported ? null : Location.getBackgroundPermissionsAsync(),
    ]);
    const precise = foreground.granted
      ? foreground.ios
        ? foreground.ios.accuracy === 'full'
        : foreground.android
          ? foreground.android.accuracy === 'fine'
          : null
      : null;
    return {
      location_foreground: foreground.status,
      location_background: background?.status ?? null,
      location_precise: precise,
    };
  } catch {
    return { location_foreground: null, location_background: null, location_precise: null };
  }
}

async function notificationPermission(): Promise<string | null> {
  try {
    return (await Notifications.getPermissionsAsync()).status;
  } catch {
    return null;
  }
}

/** The Play referrer only matters for the first install, so it is read once and cached. */
async function cachedInstallReferrer(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(INSTALL_REFERRER_KEY);
  if (stored !== null) return stored || null;
  const referrer = await getInstallReferrer();
  await AsyncStorage.setItem(INSTALL_REFERRER_KEY, referrer ?? '');
  return referrer;
}

async function buildSnapshot(subscriptionTier: SubscriptionTier | null) {
  const [location, notifications, settings, installedAt, installReferrer] = await Promise.all([
    locationPermissions(),
    notificationPermission(),
    loadSettings().catch(() => null),
    getInstallationTime(),
    cachedInstallReferrer().catch(() => null),
  ]);

  return {
    ...staticDeviceInfo(),
    country: deviceCountry(),
    ...location,
    notifications,
    settings,
    subscription_tier: subscriptionTier,
    installed_at: installedAt,
    install_referrer: installReferrer,
  };
}

async function report(
  userId: string | null,
  subscriptionTier: SubscriptionTier | null,
): Promise<void> {
  const snapshot = await buildSnapshot(subscriptionTier);
  if (!snapshot.platform) return;

  // user_id is set server-side from the session, but a sign-in still needs a resend.
  const json = JSON.stringify({ userId, snapshot });
  const last = await AsyncStorage.getItem(LAST_REPORT_KEY);
  if (last) {
    try {
      const { json: lastJson, at } = JSON.parse(last) as { json: string; at: number };
      if (lastJson === json && Date.now() - at < REPORT_EVERY_MS) return;
    } catch {}
  }

  const { error } = await supabase.rpc('upsert_device', {
    p_anonymous_user_id: await getAnonymousId(),
    p_info: snapshot,
  });
  if (error) return;

  await AsyncStorage.setItem(LAST_REPORT_KEY, JSON.stringify({ json, at: Date.now() }));
}

/** Send the device snapshot if it changed. Non-blocking, never throws. */
export function reportDevice(
  userId: string | null,
  subscriptionTier: SubscriptionTier | null,
): void {
  lastArgs = { userId, subscriptionTier };
  if (inFlight) {
    rerunAfterFlight = true;
    return;
  }
  inFlight = report(userId, subscriptionTier)
    .catch(() => {})
    .finally(() => {
      inFlight = null;
      if (rerunAfterFlight && lastArgs) {
        rerunAfterFlight = false;
        reportDevice(lastArgs.userId, lastArgs.subscriptionTier);
      }
    });
}

// Settings screens save on every toggle, so wait for changes to settle.
onSettingsSaved(() => {
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    settingsTimer = null;
    if (lastArgs) reportDevice(lastArgs.userId, lastArgs.subscriptionTier);
  }, SETTINGS_DEBOUNCE_MS);
});
