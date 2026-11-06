/**
 * Android workout session: a foreground service that runs for the length of
 * a workout and holds a headless JS task open.
 *
 * React Native stops firing JS timers on Android once the app is backgrounded
 * or the screen locks, unless a headless task is active. Without this, the
 * workout tick (and every cue it triggers) stalls until the app is reopened.
 *
 * No-op on iOS, and on Android binaries built before this module existed.
 */

import { AppRegistry, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/** Must match TASK_KEY in WorkoutSessionService.kt. */
const TASK_KEY = 'SplitCueWorkoutSession';

interface WorkoutSessionNative {
  start(title: string, body: string, usesLocation: boolean): void;
  stop(): void;
}

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<WorkoutSessionNative>('WorkoutSession')
    : null;

/** Whether the workout session foreground service is available on this build. */
export const isWorkoutSessionSupported = native != null;

let active = false;
let finishTask: (() => void) | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

if (native) {
  AppRegistry.registerHeadlessTask(TASK_KEY, () => () =>
    new Promise<void>((resolve) => {
      finishTask?.();
      // The session may have ended before the native side got the task running.
      if (active) finishTask = resolve;
      else resolve();
    }),
  );
}

export interface WorkoutSessionOptions {
  title: string;
  body: string;
  /** Also claim the location service type, so GPS keeps updating in the background. */
  usesLocation: boolean;
}

/** Start the session, or update its notification if one is already running. */
export function startWorkoutSession({ title, body, usesLocation }: WorkoutSessionOptions): void {
  if (!native) return;
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  active = true;
  try {
    native.start(title, body, usesLocation);
  } catch (e) {
    active = false;
    console.warn('Failed to start workout session:', e);
  }
}

/** End the session after `delayMs`, leaving time for a final cue to play with the screen locked. */
export function stopWorkoutSession(delayMs = 0): void {
  if (!native || !active) return;
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = setTimeout(() => {
    stopTimer = null;
    active = false;
    finishTask?.();
    finishTask = null;
    try {
      native.stop();
    } catch (e) {
      console.warn('Failed to stop workout session:', e);
    }
  }, delayMs);
}
