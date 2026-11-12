/**
 * What the runner lets shares say about them. Set from the share sheet or
 * Settings › Sharing, and remembered as the default for the next share.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../analytics/supabaseClient';
import { SENDER_NAME_MAX_LENGTH } from './shareWorkout';

export interface SharePreferences {
  /** First name shown on links and cards; empty until set. */
  senderName: string;
  includeName: boolean;
  includeResult: boolean;
  includeSplits: boolean;
  /** Off by default: a route's ends can reveal where the runner lives. */
  includeRoute: boolean;
}

export const DEFAULT_SHARE_PREFERENCES: SharePreferences = {
  senderName: '',
  includeName: true,
  includeResult: true,
  includeSplits: false,
  includeRoute: false,
};

const STORAGE_KEY = '@pacecue/share_preferences';

export async function loadSharePreferences(): Promise<SharePreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SHARE_PREFERENCES, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SHARE_PREFERENCES;
}

export async function saveSharePreferences(prefs: SharePreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

/** First word of a display name, trimmed to the share limit. */
export function firstName(displayName: string | null | undefined): string {
  return (displayName ?? '').trim().split(/\s+/)[0]?.slice(0, SENDER_NAME_MAX_LENGTH) ?? '';
}

/** The profile's first name, used when the runner hasn't set a share name. */
export async function loadProfileFirstName(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();
    return firstName(data?.display_name);
  } catch {
    return '';
  }
}
