/**
 * Contextual subscription prompts — 6 moments where SplitCue
 * naturally surfaces the Pro upgrade, without being pushy.
 *
 * Rules:
 *   - Never interrupt run starts (no prompt on workout/run screens)
 *   - Maximum 1 prompt per 7 days
 *   - Only shown to free-tier users
 *   - Each moment has a unique ID for analytics
 *   - Users who dismiss won't see the same moment again for 30 days
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from '../analytics/track';

// ── Prompt Moment Definitions ──────────────────────────────

export type PromptMomentId =
  | 'second_plan_gate'
  | 'post_workout_analysis'
  | 'race_prediction_teaser'
  | 'plan_adjustment_limit'
  | 'voice_feature_gate'
  | 'weekly_progress_nudge';

export interface PromptMoment {
  id: PromptMomentId;
  title: string;
  message: string;
  ctaLabel: string;
  icon: string;
}

export const PROMPT_MOMENTS: Record<PromptMomentId, PromptMoment> = {
  second_plan_gate: {
    id: 'second_plan_gate',
    title: 'Hit your target pace, every interval',
    message: 'Get real-time audio cues that tell you exactly where you are vs. where you want to be — no phone checking, just running.',
    ctaLabel: 'Get Pro',
    icon: 'volume-high-outline',
  },
  post_workout_analysis: {
    id: 'post_workout_analysis',
    title: 'Know exactly how you ran',
    message: 'See detailed pacing, heart rate recovery, and interval performance after every run — so you know what\'s working.',
    ctaLabel: 'Unlock Pro',
    icon: 'analytics-outline',
  },
  race_prediction_teaser: {
    id: 'race_prediction_teaser',
    title: "See how fast you're getting",
    message: 'Track your predicted race times as your training improves. See the progress you\'re making, run by run.',
    ctaLabel: 'Unlock Pro',
    icon: 'trophy-outline',
  },
  plan_adjustment_limit: {
    id: 'plan_adjustment_limit',
    title: 'See how your body handled each interval',
    message: 'Know exactly how your heart rate responded to every effort and recovery — so you can train smarter next time.',
    ctaLabel: 'Unlock Pro',
    icon: 'bar-chart-outline',
  },
  voice_feature_gate: {
    id: 'voice_feature_gate',
    title: 'Say it and run it',
    message: 'Describe any workout and SplitCue builds it instantly — "6 by 400 with 90 second recovery" and you\'re ready to go.',
    ctaLabel: 'Unlock Pro',
    icon: 'mic-outline',
  },
  weekly_progress_nudge: {
    id: 'weekly_progress_nudge',
    title: 'Great week of running!',
    message: 'You\'re building consistency. Get unlimited advanced analysis, workout comparisons, and performance insights — forever.',
    ctaLabel: 'Get Pro — $24.99',
    icon: 'trending-up-outline',
  },
};

// ── Throttling Logic ───────────────────────────────────────

const STORAGE_KEY = '@pacecue/pro_prompt_state';
const GLOBAL_COOLDOWN_DAYS = 7;
const MOMENT_COOLDOWN_DAYS = 30;

interface PromptState {
  lastShownTimestamp: number;
  momentHistory: Record<string, number>; // momentId → last shown timestamp
  dismissedMoments: string[];
}

async function getPromptState(): Promise<PromptState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    lastShownTimestamp: 0,
    momentHistory: {},
    dismissedMoments: [],
  };
}

async function savePromptState(state: PromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/**
 * Check if a prompt can be shown right now.
 * Returns the best moment to show, or null if throttled.
 */
export async function getAvailablePrompt(
  preferredMoment?: PromptMomentId,
): Promise<PromptMoment | null> {
  const state = await getPromptState();
  const now = Date.now();

  // Global cooldown: 1 prompt per 7 days
  const daysSinceLastPrompt = (now - state.lastShownTimestamp) / (1000 * 60 * 60 * 24);
  if (daysSinceLastPrompt < GLOBAL_COOLDOWN_DAYS) return null;

  // If a preferred moment is specified, check its specific cooldown
  if (preferredMoment) {
    const lastShown = state.momentHistory[preferredMoment] || 0;
    const daysSince = (now - lastShown) / (1000 * 60 * 60 * 24);
    if (daysSince < MOMENT_COOLDOWN_DAYS) return null;
    if (state.dismissedMoments.includes(preferredMoment)) return null;
    return PROMPT_MOMENTS[preferredMoment];
  }

  // Pick the first eligible moment
  const momentIds = Object.keys(PROMPT_MOMENTS) as PromptMomentId[];
  for (const id of momentIds) {
    const lastShown = state.momentHistory[id] || 0;
    const daysSince = (now - lastShown) / (1000 * 60 * 60 * 24);
    if (daysSince >= MOMENT_COOLDOWN_DAYS && !state.dismissedMoments.includes(id)) {
      return PROMPT_MOMENTS[id];
    }
  }

  return null;
}

/**
 * Record that a prompt was shown to the user.
 */
export async function recordPromptShown(momentId: PromptMomentId): Promise<void> {
  const state = await getPromptState();
  const now = Date.now();

  state.lastShownTimestamp = now;
  state.momentHistory[momentId] = now;

  await savePromptState(state);

  track('pro_prompt_shown', { moment_id: momentId });
}

/**
 * Record that the user dismissed a prompt (don't show this exact one for 30 days).
 */
export async function recordPromptDismissed(momentId: PromptMomentId): Promise<void> {
  const state = await getPromptState();
  if (!state.dismissedMoments.includes(momentId)) {
    state.dismissedMoments.push(momentId);
  }
  await savePromptState(state);

  track('pro_prompt_dismissed', { moment_id: momentId });
}

/**
 * Record that the user tapped the CTA on a prompt.
 */
export function recordPromptTapped(momentId: PromptMomentId): void {
  track('pro_prompt_tapped', { moment_id: momentId });
}
