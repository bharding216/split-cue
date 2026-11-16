/**
 * Deferred share links — recover the workout link a friend tapped before
 * they had SplitCue installed.
 *
 * The share landing page hands the code through the store install:
 *  - Android: the Google Play link carries `referrer=splitcue_share=<code>`,
 *    which Play returns from the install referrer API.
 *  - iOS: the App Store button copies the share URL to the clipboard, which
 *    the app reads once. iOS shows its paste permission prompt for this.
 *
 * Only checked on the first launch after install, so existing users are
 * never prompted.
 */

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import { initInstallTimestamp } from '../announcements/announcementService';
import { parseShareCode, shareUrlForCode } from './shareWorkout';

const REFERRER_PATTERN = /splitcue_share=([A-Za-z0-9]{4,16})/;
const CLIPBOARD_PATTERN = /splitcue\.app\/w\/[A-Za-z0-9]{4,16}/;

async function codeFromInstallReferrer(): Promise<string | null> {
  const referrer = decodeURIComponent(await Application.getInstallReferrerAsync());
  return referrer.match(REFERRER_PATTERN)?.[1] ?? null;
}

async function codeFromClipboard(): Promise<string | null> {
  if (!(await Clipboard.hasStringAsync())) return null;
  const text = await Clipboard.getStringAsync();
  const url = text.match(CLIPBOARD_PATTERN)?.[0];
  return url ? parseShareCode(url) : null;
}

/** The share URL that led to this install, or null. Only resolves to a URL on first launch. */
export async function consumeDeferredShareLink(): Promise<string | null> {
  try {
    if (!(await initInstallTimestamp())) return null;
    const code =
      Platform.OS === 'android'
        ? await codeFromInstallReferrer()
        : Platform.OS === 'ios'
          ? await codeFromClipboard()
          : null;
    return code ? shareUrlForCode(code) : null;
  } catch {
    return null;
  }
}
