/**
 * Lightweight anonymous event tracking.
 *
 * Usage:
 *   track('workout_started', { workout_id: '...', interval_count: 6 });
 *
 * Events are fire-and-forget — failures are silently swallowed so
 * analytics never crash the app or block the UI. Events that can't be sent
 * (offline, timeout, server error) are queued on the device and resent later
 * with their original time.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from './supabaseClient';
import { eventDeviceFields } from './deviceInfo';
import { createEventQueue, type SendResult } from './eventQueue';

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
const EVENT_QUEUE_KEY = '@pacecue/event_queue';
/** Without a limit, a request on a dead connection can hang until the OS gives up. */
const SEND_TIMEOUT_MS = 15_000;

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

function eventId(): string {
  return globalThis.crypto?.randomUUID?.() ?? uuid();
}

/** Offline, timed out, signed-out token, rate limited, or a server error. */
function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

async function insertEvents(rows: Record<string, unknown>[]): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const { error, status } = await supabase
      .from('events')
      .insert(rows)
      .abortSignal(controller.signal);
    if (!error) return 'sent';
    if (error.code === '23505') return 'duplicate';
    return isRetryableStatus(status) ? 'retry' : 'rejected';
  } catch {
    return 'retry';
  } finally {
    clearTimeout(timer);
  }
}

const queue = createEventQueue({
  storage: AsyncStorage,
  key: EVENT_QUEUE_KEY,
  send: (events) =>
    insertEvents(
      events.map((e) => ({ ...e.row, created_at: new Date(e.occurredAt).toISOString() })),
    ),
});

/** Resend events queued while offline. Safe to call often. */
export function flushQueuedEvents(): void {
  queue.flush().catch(() => {});
}

/**
 * Fire an analytics event. Non-blocking, never throws.
 */
export function track(
  eventName: string,
  metadata?: Record<string, unknown>,
): void {
  const occurredAt = Date.now();
  const { appVersion, environment } = appInfo();
  const country = deviceCountry();
  const device = eventDeviceFields();

  getAnonymousId()
    .then(async (anonymousUserId) => {
      const row = {
        id: eventId(),
        anonymous_user_id: anonymousUserId,
        user_id: cachedUserId,
        event_name: eventName,
        app_version: appVersion,
        environment,
        metadata: metadata ?? {},
        ...(country ? { country } : {}),
        ...device,
      };

      const result = await insertEvents([row]);
      if (result === 'retry') {
        await queue.enqueue({ row, occurredAt });
      } else {
        flushQueuedEvents();
      }
    })
    .catch(() => {
      // Analytics should never crash the app.
    });
}
