/**
 * Store-build version gate. Over-the-air updates only reach builds with the
 * same runtime version, so builds older than the minimum in
 * `app_min_versions` are sent to the store instead.
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

/**
 * Whether this store build is below the platform's minimum. Only production
 * builds are gated; dev and preview builds have no runtime version or another
 * channel. Fails open when the minimum can't be fetched.
 */
export async function isUpdateRequired(): Promise<boolean> {
  // runtimeVersion is the installed build's version under the appVersion
  // policy, while expoConfig.version reports the running OTA update's.
  const installed = Updates.runtimeVersion;
  if (!installed || Updates.channel !== 'production') return false;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;

  const { data, error } = await supabase
    .from('app_min_versions')
    .select('min_version')
    .eq('platform', Platform.OS)
    .maybeSingle();
  if (error || !data?.min_version) return false;

  return compareVersions(installed, data.min_version) < 0;
}

/** Checks on launch and whenever the app returns to the foreground. */
export function useRequiredUpdate(): boolean {
  const [required, setRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      isUpdateRequired()
        .then((value) => {
          if (!cancelled) setRequired(value);
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

  return required;
}
