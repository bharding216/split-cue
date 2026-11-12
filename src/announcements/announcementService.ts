/**
 * Announcement service — shows a single "what's new" alert per app open
 * to existing users only.
 *
 * New installs get an `installedAt` timestamp on first launch; only
 * announcements with a `date` after that timestamp are eligible.
 * Each announcement also has an `expiresAt` date so stale news is
 * silently skipped.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ANNOUNCEMENTS, type Announcement } from './announcements';

const DISMISSED_KEY = '@pacecue/dismissed_announcements';
const INSTALLED_KEY = '@pacecue/installed_at';

let installInit: Promise<boolean> | null = null;

/**
 * Record the install timestamp if one doesn't already exist.
 * Safe to call on every app open — only writes once. Resolves to `true`
 * on the first launch after install, including from every caller that
 * launch.
 */
export function initInstallTimestamp(): Promise<boolean> {
  installInit ??= (async () => {
    const existing = await AsyncStorage.getItem(INSTALLED_KEY);
    if (existing) return false;
    await AsyncStorage.setItem(INSTALLED_KEY, new Date().toISOString());
    return true;
  })();
  return installInit;
}

async function getInstalledAt(): Promise<Date> {
  const raw = await AsyncStorage.getItem(INSTALLED_KEY);
  // Fallback: treat missing as "right now" (same effect — skip everything)
  return raw ? new Date(raw) : new Date();
}

async function getDismissedIds(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(DISMISSED_KEY);
  return new Set(raw ? JSON.parse(raw) : []);
}

/**
 * Returns the single highest-priority unseen announcement, or `null`.
 * Priority is determined by array order in `ANNOUNCEMENTS` (first wins).
 */
export async function getUnseenAnnouncement(): Promise<Announcement | null> {
  const [dismissed, installedAt] = await Promise.all([
    getDismissedIds(),
    getInstalledAt(),
  ]);

  const now = new Date();

  return (
    ANNOUNCEMENTS.find((a) => {
      if (dismissed.has(a.id)) return false;
      if (new Date(a.expiresAt) < now) return false;
      if (new Date(a.date) <= installedAt) return false;
      return true;
    }) ?? null
  );
}

/** Mark an announcement as dismissed so it never shows again. */
export async function dismissAnnouncement(id: string): Promise<void> {
  const dismissed = await getDismissedIds();
  dismissed.add(id);
  await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
}
