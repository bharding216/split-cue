/**
 * Whether the runner has agreed to save heart rate readings to their account.
 *
 * Readings are always recorded and kept on the device, and summary metrics
 * (average, max, per-interval) sync with workout history either way. Only the
 * second-by-second readings depend on this choice.
 *
 * The choice is kept on the device and mirrored to the runner's profile so it
 * follows them to other devices; whichever was decided most recently wins.
 */

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../analytics/supabaseClient';
import { trackHr, type HrConsentSource } from '../analytics/hrEvents';

export type HrCloudConsent = 'granted' | 'declined' | 'undecided';

export const PRIVACY_POLICY_URL = 'https://www.brandonharding.dev/pacecue/privacy';

const STORAGE_KEY = '@pacecue/hr_cloud_consent';

interface StoredConsent {
  granted: boolean;
  /** When the choice was made (epoch ms). */
  at: number;
}

let cached: StoredConsent | null | undefined;
const listeners = new Set<(consent: HrCloudConsent) => void>();

function toConsent(stored: StoredConsent | null | undefined): HrCloudConsent {
  if (!stored) return 'undecided';
  return stored.granted ? 'granted' : 'declined';
}

async function loadStored(): Promise<StoredConsent | null> {
  if (cached !== undefined) return cached;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as StoredConsent) : null;
  } catch {
    cached = null;
  }
  return cached;
}

async function saveStored(stored: StoredConsent | null): Promise<void> {
  cached = stored;
  if (stored) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  else await AsyncStorage.removeItem(STORAGE_KEY);
  const consent = toConsent(stored);
  listeners.forEach((l) => l(consent));
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function pushToProfile(userId: string, stored: StoredConsent): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      hr_cloud_consent: stored.granted,
      hr_cloud_consent_at: new Date(stored.at).toISOString(),
    })
    .eq('id', userId);
  if (error) console.warn('Failed to save heart rate consent to profile:', error.message);
}

export async function getHrCloudConsent(): Promise<HrCloudConsent> {
  return toConsent(await loadStored());
}

/** Record the runner's answer to the consent prompt, or turning saving back on in settings. */
export async function setHrCloudConsent(granted: boolean, source: HrConsentSource): Promise<void> {
  const stored = { granted, at: Date.now() };
  await saveStored(stored);
  trackHr(granted ? 'hr_consent_granted' : 'hr_consent_declined', { source });
  const userId = await currentUserId();
  if (userId) await pushToProfile(userId, stored);
}

/**
 * Stop saving readings to the account, optionally deleting the readings
 * already saved there. Readings on this device are kept.
 */
export async function revokeHrCloudConsent(deleteCloudCopies: boolean): Promise<{ error: string | null }> {
  const stored = { granted: false, at: Date.now() };
  await saveStored(stored);
  const userId = await currentUserId();
  let error: string | null = null;
  if (userId) {
    await pushToProfile(userId, stored);
    if (deleteCloudCopies) {
      const result = await supabase.from('workout_hr_samples').delete().eq('user_id', userId);
      error = result.error?.message ?? null;
    }
  }
  trackHr('hr_consent_revoked', { deleted_cloud_copies: deleteCloudCopies && !error });
  return { error };
}

/** Reconcile with the profile: the more recent choice wins. Called during cloud sync. */
export async function syncHrCloudConsent(userId: string): Promise<HrCloudConsent> {
  const local = await loadStored();
  const { data, error } = await supabase
    .from('profiles')
    .select('hr_cloud_consent, hr_cloud_consent_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) return toConsent(local);

  const remote: StoredConsent | null =
    data?.hr_cloud_consent != null && data.hr_cloud_consent_at
      ? { granted: data.hr_cloud_consent, at: new Date(data.hr_cloud_consent_at).getTime() }
      : null;

  if (remote && (!local || remote.at > local.at)) {
    await saveStored(remote);
    return toConsent(remote);
  }
  if (local && (!remote || local.at > remote.at)) await pushToProfile(userId, local);
  return toConsent(local);
}

/** Forget the choice on this device, e.g. when signing out. */
export async function clearHrCloudConsent(): Promise<void> {
  await saveStored(null);
}

/** The current choice; null until loaded. */
export function useHrCloudConsent(): HrCloudConsent | null {
  const [consent, setConsent] = useState<HrCloudConsent | null>(
    cached !== undefined ? toConsent(cached) : null,
  );
  useEffect(() => {
    let active = true;
    getHrCloudConsent().then((c) => {
      if (active) setConsent(c);
    });
    listeners.add(setConsent);
    return () => {
      active = false;
      listeners.delete(setConsent);
    };
  }, []);
  return consent;
}
