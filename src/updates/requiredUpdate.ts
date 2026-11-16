/**
 * Store-build version gate. Over-the-air updates only reach builds with the
 * same runtime version, so builds older than the minimum in
 * `app_min_versions` are sent to the store instead.
 *
 * Three tiers:
 *   - Below min_version  → update required (blocked)
 *   - Below latest_version but ≥ min_version → update available (suggested)
 *   - At or above latest_version → current
 */

import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import { supabase } from '../analytics/supabaseClient';

export const APP_STORE_URL =
  'https://apps.apple.com/us/app/pacecue-interval-timer/id6809834816';
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.surmount.pacecue';

export async function openStoreListing(): Promise<void> {
  await Linking.openURL(Platform.OS === 'android' ? PLAY_STORE_URL : APP_STORE_URL);
}

/** Negative when a < b, positive when a > b. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export type VersionGate =
  | { status: 'current' }
  | { status: 'update-available'; latestVersion: string }
  | { status: 'update-required' };

/**
 * Determine the version gate status for this store build. Only production
 * builds are gated; dev and preview builds always return 'current'.
 * Fails open (returns 'current') when the config can't be fetched.
 */
export async function checkVersionGate(): Promise<VersionGate> {
  const installed = Updates.runtimeVersion;
  if (!installed || Updates.channel !== 'production') return { status: 'current' };
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return { status: 'current' };

  const { data, error } = await supabase
    .from('app_min_versions')
    .select('min_version, latest_version')
    .eq('platform', Platform.OS)
    .maybeSingle();
  if (error || !data?.min_version) return { status: 'current' };

  if (compareVersions(installed, data.min_version) < 0) {
    return { status: 'update-required' };
  }

  if (data.latest_version && compareVersions(installed, data.latest_version) < 0) {
    return { status: 'update-available', latestVersion: data.latest_version };
  }

  return { status: 'current' };
}

/** Checks on launch and whenever the app returns to the foreground. */
export function useVersionGate(): VersionGate {
  const [gate, setGate] = useState<VersionGate>({ status: 'current' });

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      checkVersionGate()
        .then((value) => {
          if (!cancelled) setGate(value);
        })
        .catch(() => {});
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return gate;
}

// Keep the old hook as a convenience alias for the layout's existing usage
// until we finish wiring the new gate. It reads from useVersionGate.
/** @deprecated Use useVersionGate() instead. */
export function useRequiredUpdate(): boolean {
  const gate = useVersionGate();
  return gate.status === 'update-required';
}
