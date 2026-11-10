/**
 * When to ask for an App Store / Play Store review. Pure logic, kept apart
 * from the native prompt so it can be unit tested.
 */

import type { FlatInterval } from '../workout/workoutTypes';

/** Qualifying run counts at which a prompt becomes due. */
export const REVIEW_MILESTONES = [3, 10, 25, 50] as const;
/** No two prompts closer together than this, whatever the run count. */
export const MIN_DAYS_BETWEEN_PROMPTS = 60;
/** After the last milestone, ask again this often. */
export const DAYS_BETWEEN_LATE_PROMPTS = 120;

/** Feelings that make right after the run a bad moment to ask. */
const UNHAPPY_FEELS = new Set(['Tough']);

const DAY_MS = 86_400_000;

export interface ReviewState {
  /** Highest milestone already used for a prompt (0 if none). */
  milestone: number;
  /** When a prompt was last shown (epoch ms, 0 if never). */
  lastPromptAt: number;
}

export const INITIAL_REVIEW_STATE: ReviewState = { milestone: 0, lastPromptAt: 0 };

/**
 * Read saved state, including the older format that counted completions
 * itself (`{ completedCount, lastPromptedAt }` where lastPromptedAt was a count).
 * That format has no prompt time, so a past prompt is treated as just now.
 */
export function parseReviewState(raw: unknown, now: number): ReviewState {
  if (!raw || typeof raw !== 'object') return INITIAL_REVIEW_STATE;
  const r = raw as Record<string, unknown>;
  if (typeof r.milestone === 'number' && typeof r.lastPromptAt === 'number') {
    return { milestone: r.milestone, lastPromptAt: r.lastPromptAt };
  }
  const legacyPromptedAt = typeof r.lastPromptedAt === 'number' ? r.lastPromptedAt : 0;
  if (legacyPromptedAt <= 0) return INITIAL_REVIEW_STATE;
  return { milestone: milestoneReached(legacyPromptedAt), lastPromptAt: now };
}

function milestoneReached(runCount: number): number {
  return REVIEW_MILESTONES.filter((m) => m <= runCount).pop() ?? 0;
}

/** Whether a prompt is due for someone with `runCount` qualifying runs. */
export function isReviewDue(state: ReviewState, runCount: number, now: number): boolean {
  const sinceLast = now - state.lastPromptAt;
  if (state.lastPromptAt > 0 && sinceLast < MIN_DAYS_BETWEEN_PROMPTS * DAY_MS) return false;
  const next = REVIEW_MILESTONES.find((m) => m > state.milestone);
  if (next != null) return runCount >= next;
  return sinceLast >= DAYS_BETWEEN_LATE_PROMPTS * DAY_MS;
}

/** State after a prompt is shown. Milestones already passed are used up too. */
export function afterPrompt(state: ReviewState, runCount: number, now: number): ReviewState {
  return { milestone: Math.max(state.milestone, milestoneReached(runCount)), lastPromptAt: now };
}

/** Whether the end of this run is a good moment to ask. */
export function isGoodReviewMoment(run: { completed: boolean; feel: string | null }): boolean {
  return run.completed && !(run.feel && UNHAPPY_FEELS.has(run.feel));
}

/**
 * Whether stopping at `currentIndex` only cut the cooldown, so the run
 * still counts as finished.
 */
export function onlyCooldownRemains(intervals: readonly FlatInterval[], currentIndex: number): boolean {
  if (currentIndex <= 0 || currentIndex >= intervals.length) return false;
  return intervals.slice(currentIndex).every((i) => i.segmentType === 'cooldown');
}
