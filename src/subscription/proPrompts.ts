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
    title: 'Hear every split called out',
    message: 'Pro unlocks premium voice guidance — crystal-clear pace and interval cues so you never have to check your phone.',
    ctaLabel: 'Unlock Premium Voice',
    icon: 'volume-high-outline',
  },
  post_workout_analysis: {
    id: 'post_workout_analysis',
    title: 'Know exactly how you ran',
    message: 'Pro members get detailed performance insights after every run — interval pacing, heart rate recovery, and what to focus on next.',
    ctaLabel: 'Unlock Run Insights',
    icon: 'analytics-outline',
  },
  race_prediction_teaser: {
    id: 'race_prediction_teaser',
    title: "See how fast you're getting",
    message: "Pro unlocks predicted race times, pace trends, and progress tracking so you can see exactly how your training is paying off.",
    ctaLabel: 'See My Predictions',
    icon: 'trophy-outline',
  },
  plan_adjustment_limit: {
    id: 'plan_adjustment_limit',
    title: 'Dive deeper into your splits',
    message: 'Pro unlocks detailed interval heart rate analysis, pace consistency scoring, and recovery metrics for every run.',
    ctaLabel: 'Unlock Detailed Analysis',
    icon: 'bar-chart-outline',
  },
  voice_feature_gate: {
    id: 'voice_feature_gate',
    title: 'Create workouts by voice',
    message: 'Describe any workout and SplitCue builds it instantly — "6 by 400 with 90 second recovery" and you\'re ready to run.',
    ctaLabel: 'Unlock Voice Builder',
    icon: 'mic-outline',
  },
  weekly_progress_nudge: {
    id: 'weekly_progress_nudge',
    title: 'Great week of running!',
    message: "You're building consistency. Pro members get weekly summaries, personal records tracking, and full cloud history.",
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
