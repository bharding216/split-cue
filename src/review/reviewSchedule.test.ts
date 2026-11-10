import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FlatInterval, SegmentType } from '../workout/workoutTypes';
import {
  INITIAL_REVIEW_STATE,
  afterPrompt,
  isGoodReviewMoment,
  isReviewDue,
  onlyCooldownRemains,
  parseReviewState,
} from './reviewSchedule';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function intervals(...types: SegmentType[]): FlatInterval[] {
  return types.map((segmentType) => ({ segmentType, durationSeconds: 60 }) as FlatInterval);
}

test('first prompt is due at the third run', () => {
  assert.equal(isReviewDue(INITIAL_REVIEW_STATE, 2, NOW), false);
  assert.equal(isReviewDue(INITIAL_REVIEW_STATE, 3, NOW), true);
});

test('next milestone waits for the minimum gap', () => {
  const state = afterPrompt(INITIAL_REVIEW_STATE, 3, NOW);
  assert.equal(isReviewDue(state, 10, NOW + 30 * DAY), false);
  assert.equal(isReviewDue(state, 10, NOW + 60 * DAY), true);
  assert.equal(isReviewDue(state, 9, NOW + 90 * DAY), false);
});

test('passed milestones are used up together', () => {
  const state = afterPrompt(INITIAL_REVIEW_STATE, 30, NOW);
  assert.equal(state.milestone, 25);
  assert.equal(isReviewDue(state, 49, NOW + 200 * DAY), false);
  assert.equal(isReviewDue(state, 50, NOW + 200 * DAY), true);
});

test('after the last milestone, prompts repeat on time alone', () => {
  const state = afterPrompt(INITIAL_REVIEW_STATE, 50, NOW);
  assert.equal(isReviewDue(state, 200, NOW + 119 * DAY), false);
  assert.equal(isReviewDue(state, 200, NOW + 120 * DAY), true);
});

test('legacy state keeps its milestone and restarts the gap', () => {
  const state = parseReviewState({ completedCount: 14, lastPromptedAt: 10 }, NOW);
  assert.deepEqual(state, { milestone: 10, lastPromptAt: NOW });
  assert.deepEqual(parseReviewState({ completedCount: 2, lastPromptedAt: 0 }, NOW), INITIAL_REVIEW_STATE);
  assert.deepEqual(parseReviewState(null, NOW), INITIAL_REVIEW_STATE);
});

test('only finished runs that did not feel tough are good moments', () => {
  assert.equal(isGoodReviewMoment({ completed: true, feel: null }), true);
  assert.equal(isGoodReviewMoment({ completed: true, feel: 'Strong' }), true);
  assert.equal(isGoodReviewMoment({ completed: true, feel: 'Tough' }), false);
  assert.equal(isGoodReviewMoment({ completed: false, feel: 'Strong' }), false);
});

test('stopping during the cooldown counts as finishing', () => {
  const plan = intervals('warmup', 'run', 'recovery', 'run', 'cooldown', 'cooldown');
  assert.equal(onlyCooldownRemains(plan, 4), true);
  assert.equal(onlyCooldownRemains(plan, 5), true);
  assert.equal(onlyCooldownRemains(plan, 3), false);
  assert.equal(onlyCooldownRemains(intervals('run', 'run'), 1), false);
  assert.equal(onlyCooldownRemains(intervals('cooldown'), 0), false);
});
