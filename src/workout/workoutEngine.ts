/**
 * Platform-independent workout state machine.
 *
 * Key design decisions (from the ChatGPT conversation):
 * - Uses absolute timestamps, NOT `setInterval(() => seconds--, 1000)`.
 * - Tracks `intervalEndsAt = Date.now() + remaining` so the timer is robust
 *   even when the JS thread pauses (phone locked, background, etc.).
 * - Purely functional: every mutation returns a new EngineState.
 */

import {
  EngineState,
  FlatInterval,
  WorkoutDefinition,
  flattenWorkout,
  DISTANCE_INTERVAL_MAX_MS,
  isUntimedInterval,
} from './workoutTypes';

/** Create a fresh engine state for a workout. */
export function createEngineState(
  workout: WorkoutDefinition
): EngineState {
  const intervals = flattenWorkout(workout);
  return {
    phase: 'idle',
    intervals,
    currentIndex: 0,
    intervalEndsAt: 0,
    pausedRemaining: 0,
    totalElapsedMs: 0,
    startedAt: 0,
  };
}

/** Compute the engine duration for an interval (distance-based and open-ended use a large sentinel). */
function intervalDurationMs(interval: FlatInterval): number {
  if (isUntimedInterval(interval)) return DISTANCE_INTERVAL_MAX_MS;
  return interval.durationSeconds * 1000;
}

/** Start the workout. */
export function startWorkout(state: EngineState): EngineState {
  if (state.intervals.length === 0) return state;
  const now = Date.now();
  const first = state.intervals[0];
  return {
    ...state,
    phase: 'running',
    currentIndex: 0,
    intervalEndsAt: now + intervalDurationMs(first),
    pausedRemaining: 0,
    startedAt: now,
  };
}

/** Pause the workout. Snapshots the remaining time. */
export function pauseWorkout(state: EngineState): EngineState {
  if (state.phase !== 'running') return state;
  const now = Date.now();
  const remaining = Math.max(0, state.intervalEndsAt - now);
  return {
    ...state,
    phase: 'paused',
    pausedRemaining: remaining,
    totalElapsedMs: state.totalElapsedMs + (now - (state.intervalEndsAt - getCurrentIntervalDuration(state) * 1000)),
  };
}

/** Resume from pause using stored remaining time + a fresh absolute timestamp. */
export function resumeWorkout(state: EngineState): EngineState {
  if (state.phase !== 'paused') return state;
  const now = Date.now();
  return {
    ...state,
    phase: 'running',
    intervalEndsAt: now + state.pausedRemaining,
    pausedRemaining: 0,
  };
}

/** Skip to the next interval (user-initiated). Anchors timing to Date.now(). */
export function skipInterval(state: EngineState): EngineState {
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.intervals.length) {
    return finishWorkout(state);
  }
  const now = Date.now();
  const next = state.intervals[nextIndex];
  return {
    ...state,
    phase: 'running',
    currentIndex: nextIndex,
    intervalEndsAt: now + intervalDurationMs(next),
    pausedRemaining: 0,
  };
}

/**
 * Called when the current interval's time has expired. Chains the next
 * interval's end time from the previous `intervalEndsAt` instead of
 * Date.now() so the workout doesn't drift when the JS tick fires late
 * (e.g. while the app is backgrounded).
 */
export function advanceInterval(state: EngineState): EngineState {
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.intervals.length) {
    return finishWorkout(state);
  }
  const now = Date.now();
  const next = state.intervals[nextIndex];
  const prevWasUntimed = isUntimedInterval(state.intervals[state.currentIndex]);
  // For time-based intervals, chain from the previous intervalEndsAt to prevent drift.
  // For distance-based and open-ended intervals, anchor to now since they don't end on time.
  const anchor = prevWasUntimed ? now : state.intervalEndsAt;
  return {
    ...state,
    phase: 'running',
    currentIndex: nextIndex,
    intervalEndsAt: anchor + intervalDurationMs(next),
    pausedRemaining: 0,
  };
}

/** Mark the workout as finished. */
export function finishWorkout(state: EngineState): EngineState {
  const now = Date.now();
  return {
    ...state,
    phase: 'finished',
    totalElapsedMs: now - state.startedAt,
  };
}

/** Stop and reset to idle. */
export function stopWorkout(state: EngineState): EngineState {
  const now = Date.now();
  return {
    ...state,
    phase: 'finished',
    totalElapsedMs: state.startedAt > 0 ? now - state.startedAt : 0,
  };
}

// ── Derived / Query helpers ──────────────────────────────────────────

/** Get the current FlatInterval. */
export function currentInterval(state: EngineState): FlatInterval | null {
  if (state.currentIndex < 0 || state.currentIndex >= state.intervals.length)
    return null;
  return state.intervals[state.currentIndex];
}

/** Remaining seconds for the current interval. */
export function remainingSeconds(state: EngineState): number {
  if (state.phase === 'paused') {
    return Math.max(0, Math.ceil(state.pausedRemaining / 1000));
  }
  if (state.phase !== 'running') return 0;
  const remaining = Math.max(0, state.intervalEndsAt - Date.now());
  return Math.ceil(remaining / 1000);
}

/** Remaining ms (for progress bar precision). */
export function remainingMs(state: EngineState): number {
  if (state.phase === 'paused') return Math.max(0, state.pausedRemaining);
  if (state.phase !== 'running') return 0;
  return Math.max(0, state.intervalEndsAt - Date.now());
}

/** Progress fraction (0..1) through the current interval. */
export function intervalProgress(state: EngineState): number {
  const ci = currentInterval(state);
  if (!ci) return 0;
  const totalMs = ci.durationSeconds * 1000;
  const rem = remainingMs(state);
  return Math.max(0, Math.min(1, 1 - rem / totalMs));
}

/** Whether the current interval has expired by time. Distance-based and open-ended intervals never expire by time. */
export function isIntervalExpired(state: EngineState): boolean {
  if (state.phase !== 'running') return false;
  const ci = currentInterval(state);
  if (ci && isUntimedInterval(ci)) return false;
  return Date.now() >= state.intervalEndsAt;
}

/** Get the duration of the current interval in seconds. */
function getCurrentIntervalDuration(state: EngineState): number {
  const ci = currentInterval(state);
  return ci ? ci.durationSeconds : 0;
}

/** Total remaining seconds for the entire workout from current position. */
export function totalRemainingSeconds(state: EngineState): number {
  if (state.phase === 'finished' || state.phase === 'idle') return 0;
  const ci = currentInterval(state);
  const currentRemaining = ci && isUntimedInterval(ci) ? 0 : remainingSeconds(state);
  let futureTotal = 0;
  for (let i = state.currentIndex + 1; i < state.intervals.length; i++) {
    futureTotal += state.intervals[i].durationSeconds;
  }
  return currentRemaining + futureTotal;
}

/** Next interval (for "up next" display). */
export function nextInterval(state: EngineState): FlatInterval | null {
  const next = state.currentIndex + 1;
  if (next >= state.intervals.length) return null;
  return state.intervals[next];
}
