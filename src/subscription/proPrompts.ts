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
    title: 'Ready for your next goal?',
    message: "Chase a new goal, adjust your timeline, or keep multiple plans running at once with Pro.",
    ctaLabel: 'Unlock More Plans',
    icon: 'calendar-outline',
  },
  post_workout_analysis: {
    id: 'post_workout_analysis',
    title: 'Know what to change next',
    message: 'Pro members get a coach review after every run — see what worked, what to adjust, and whether your upcoming workouts should change.',
    ctaLabel: 'Unlock Coach Reviews',
    icon: 'analytics-outline',
  },
  race_prediction_teaser: {
    id: 'race_prediction_teaser',
    title: 'See how fast you're getting',
    message: "Pro unlocks predicted race times, pace trends, and progress tracking so you can see exactly how your training is paying off.",
    ctaLabel: 'See My Predictions',
    icon: 'trophy-outline',
  },
  plan_adjustment_limit: {
    id: 'plan_adjustment_limit',
    title: 'Life changed? Your plan can too.',
    message: "Busy week, feeling tired, or goals shifting — Pro lets your coach rework the plan so you keep progressing.",
    ctaLabel: 'Unlock Plan Adjustments',
    icon: 'sparkles-outline',
  },
  voice_feature_gate: {
    id: 'voice_feature_gate',
    title: 'Speak to your coach',
    message: "Tell your AI coach what you need — mid-run or post-workout, just speak and your plan adapts. Pro only.",
    ctaLabel: 'Unlock Voice Coach',
    icon: 'mic-outline',
  },
  weekly_progress_nudge: {
    id: 'weekly_progress_nudge',
    title: 'Great week of training!',
    message: "You're building consistency. Pro members get personalized weekly summaries, rolling plan adjustments, and race day readiness scores.",
    ctaLabel: 'Level Up with Pro',
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
