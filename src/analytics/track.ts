/**
 * Lightweight anonymous event tracking.
 *
 * Usage:
 *   track('workout_started', { workout_id: '...', interval_count: 6 });
 *
 * Events are fire-and-forget — failures are silently swallowed so
 * analytics never crash the app or block the UI.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from './supabaseClient';
import { eventDeviceFields } from './deviceInfo';

/** Cached authenticated user ID, updated when auth state changes. */
let cachedUserId: string | null = null;

/**
 * Device region (ISO 3166-1 alpha-2), cached for the session.
 * `undefined` means not read yet. Read from the device Language & Region setting.
 */
let cachedCountry: string | null | undefined;

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user?.id ?? null;
});

const ANONYMOUS_ID_KEY = '@pacecue/anonymous_id';

/** In-memory cache so we only hit AsyncStorage once per session. */
let cachedId: string | null = null;

/** Generate a simple UUID v4. */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Get or create a persistent anonymous user ID.
 * Created once on first call, then cached in memory + AsyncStorage.
 */
export async function getAnonymousId(): Promise<string> {
  if (cachedId) return cachedId;

  try {
    const stored = await AsyncStorage.getItem(ANONYMOUS_ID_KEY);
    if (stored) {
      cachedId = stored;
      return stored;
    }
  } catch {}

  const newId = uuid();
  cachedId = newId;

  try {
    await AsyncStorage.setItem(ANONYMOUS_ID_KEY, newId);
  } catch {}

  return newId;
}

function normalizeCountry(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  return code.toUpperCase();
}

/**
 * Country from the device region setting. Falls back to the locale region
 * so a JS update still records a country on binaries that don't include
 * expo-localization yet.
 */
export function deviceCountry(): string | null {
  if (cachedCountry !== undefined) return cachedCountry;

  let country: string | null = null;
  try {
    const { getLocales } = require('expo-localization') as typeof import('expo-localization');
    country = normalizeCountry(getLocales()[0]?.regionCode);
  } catch {
    country = null;
  }

  if (!country) {
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale;
      country = normalizeCountry(locale.split('-').pop());
    } catch {
      country = null;
    }
  }

  cachedCountry = country;
  return country;
}

export function appInfo(): { appVersion: string; environment: string } {
  return {
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    environment: (Constants.expoConfig?.extra?.appVariant as string) ?? 'production',
  };
}

/**
 * Fire an analytics event. Non-blocking, never throws.
 */
export function track(
  eventName: string,
  metadata?: Record<string, unknown>,
): void {
  const { appVersion, environment } = appInfo();
  const country = deviceCountry();
  const device = eventDeviceFields();

  getAnonymousId()
    .then(async (anonymousUserId) => {
      const baseRow = {
        anonymous_user_id: anonymousUserId,
        user_id: cachedUserId,
        event_name: eventName,
        app_version: appVersion,
        environment,
        metadata: metadata ?? {},
      };
      const withCountry = { ...baseRow, ...(country ? { country } : {}) };

      const { error } = await supabase.from('events').insert({ ...withCountry, ...device });
      // Keep recording events if the newer columns aren't migrated yet.
      if (error) {
        const { error: retryError } = await supabase.from('events').insert(withCountry);
        if (retryError && country) {
          await supabase.from('events').insert(baseRow);
        }
      }
    })
    .catch(() => {
      // Analytics should never crash the app.
    });
}
