/**
 * Recommending SplitCue itself, from Settings › About and a one-time
 * "Tell a friend" prompt after the runner's third finished run.
 */

import { Platform, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from '../analytics/track';

export const INVITE_URL = 'https://splitcue.app/?ref=invite';

const INVITE_MESSAGE =
  "I've been using SplitCue for guided runs and interval training. You can build workouts, " +
  'get audio pace cues, and track how you perform. Check it out:';

/** Runs finished before the post-run prompt appears. */
export const INVITE_PROMPT_AFTER_RUNS = 3;
const INVITE_PROMPT_KEY = '@pacecue/invite_prompt_shown';

/** Open the system share sheet with the SplitCue invite. Resolves true if shared. */
export async function shareSplitCue(surface: string): Promise<boolean> {
  track('app_share_opened', { surface });
  try {
    const result = await Share.share(
      Platform.OS === 'ios'
        ? { message: INVITE_MESSAGE, url: INVITE_URL }
        : { message: `${INVITE_MESSAGE} ${INVITE_URL}` },
    );
    const shared = result.action === Share.sharedAction;
    if (shared) track('app_shared', { surface });
    return shared;
  } catch {
    return false;
  }
}

/** Whether to show the post-run invite: once, from the third finished run on. */
export async function shouldShowInvitePrompt(completedRuns: number): Promise<boolean> {
  if (completedRuns < INVITE_PROMPT_AFTER_RUNS) return false;
  try {
    return (await AsyncStorage.getItem(INVITE_PROMPT_KEY)) == null;
  } catch {
    return false;
  }
}

export async function markInvitePromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(INVITE_PROMPT_KEY, String(Date.now()));
  } catch {}
}
