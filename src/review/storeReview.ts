/**
 * Store review prompt.
 *
 * Asked when the runner leaves the post-run screen, at run-count milestones
 * (see reviewSchedule). The native StoreKit / Google Play APIs also enforce
 * their own rate limits, so even when we ask the OS may silently no-op.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { loadQualifyingHistory } from '../analytics/workoutContext';
import { withHistoryLock } from '../workout/workoutStorage';
import {
  afterPrompt,
  isGoodReviewMoment,
  isReviewDue,
  parseReviewState,
  type ReviewState,
} from './reviewSchedule';

const STORAGE_KEY = '@pacecue/review_state';

/** Lets the post-run screen finish closing before the prompt appears. */
const PROMPT_DELAY_MS = 800;

async function loadReviewState(): Promise<ReviewState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return parseReviewState(raw ? JSON.parse(raw) : null, Date.now());
}

let requesting = false;

/**
 * Call as the runner leaves the post-run screen. Asks for a review if this run
 * was a good moment and a milestone is due.
 */
export async function requestReviewAfterRun(run: {
  completed: boolean;
  feel: string | null;
}): Promise<void> {
  if (requesting || !isGoodReviewMoment(run)) return;
  requesting = true;
  try {
    const state = await loadReviewState();
    // The lock waits out the save of the run that just finished.
    const runCount = (await withHistoryLock(loadQualifyingHistory)).length;
    if (!isReviewDue(state, runCount, Date.now())) return;
    if (!(await StoreReview.isAvailableAsync())) return;

    await new Promise((r) => setTimeout(r, PROMPT_DELAY_MS));
    // The OS ignores requests from the background, which would waste the milestone.
    if (AppState.currentState !== 'active') return;

    await StoreReview.requestReview();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(afterPrompt(state, runCount, Date.now())));
  } catch {
    // Review prompts are best-effort — never crash the app over this.
  } finally {
    requesting = false;
  }
}
