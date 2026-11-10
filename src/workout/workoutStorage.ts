/**
 * Workout persistence layer using AsyncStorage.
 * No backend, no auth — everything stays on-device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WorkoutDefinition,
  WorkoutBlock,
  Segment,
  RepeatGroup,
  CompletedWorkout,
  AppSettings,
  DEFAULT_SETTINGS,
  generateId,
  type SegmentType,
  type Intensity,
  type SegmentTarget,
} from './workoutTypes';
import { PREMIUM_VOICES, DEFAULT_PREMIUM_VOICE_ID } from '../audio/voiceCatalog';
import {
  clearAllHeartRateSamples,
  deleteHeartRateSamples,
  hasHeartRateSamples,
  saveHeartRateSamples,
} from '../heartRate/hrSampleStore';
import type { HrSample } from '../heartRate/hrTypes';

const STORAGE_KEYS = {
  WORKOUTS: '@pacecue/workouts',
  HISTORY: '@pacecue/history',
  SETTINGS: '@pacecue/settings',
} as const;

// ── Migration ────────────────────────────────────────────────────────

/**
 * Detect whether a raw workout object uses the old three-section format
 * (warmup/blocks/cooldown arrays of WorkoutRepeatBlock) and convert it
 * to the new flat WorkoutBlock[] model.
 *
 * Detection: the old format has an array-valued `warmup` property whose
 * elements have an `intervals` array. The new format has a `blocks`
 * property whose elements have a `blockType` string.
 */
export function migrateToBlockModel(raw: any): WorkoutDefinition {
  // Already new format: blocks with blockType
  if (
    Array.isArray(raw.blocks) &&
    raw.blocks.length > 0 &&
    raw.blocks[0].blockType
  ) {
    return raw as WorkoutDefinition;
  }

  // Handle very old format: warmup/cooldown as single objects instead of arrays
  let oldWarmup: any[] = [];
  let oldBlocks: any[] = [];
  let oldCooldown: any[] = [];

  if (Array.isArray(raw.warmup)) {
    oldWarmup = raw.warmup;
  } else if (raw.warmup && typeof raw.warmup === 'object') {
    oldWarmup = [{ intervals: [raw.warmup], repeatCount: 1 }];
  }

  if (Array.isArray(raw.blocks)) {
    oldBlocks = raw.blocks;
  }

  if (Array.isArray(raw.cooldown)) {
    oldCooldown = raw.cooldown;
  } else if (raw.cooldown && typeof raw.cooldown === 'object') {
    oldCooldown = [{ intervals: [raw.cooldown], repeatCount: 1 }];
  }

  const newBlocks: WorkoutBlock[] = [];

  // Convert each old section
  for (const block of oldWarmup) {
    newBlocks.push(...convertOldRepeatBlock(block, 'warmup'));
  }
  for (const block of oldBlocks) {
    newBlocks.push(...convertOldRepeatBlock(block, 'main'));
  }
  for (const block of oldCooldown) {
    newBlocks.push(...convertOldRepeatBlock(block, 'cooldown'));
  }

  const result: WorkoutDefinition = {
    id: raw.id ?? generateId(),
    name: raw.name ?? '',
    blocks: newBlocks,
    targetDistanceMeters: raw.targetDistanceMeters,
    category: raw.category,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
  };

  return result;
}

/** Convert a single old-format RepeatBlock into new WorkoutBlock(s). */
function convertOldRepeatBlock(
  block: any,
  section: 'warmup' | 'main' | 'cooldown',
): WorkoutBlock[] {
  const intervals: any[] = block.intervals ?? [];
  if (intervals.length === 0) return [];

  const newInnerBlocks = intervals.map((int: any) =>
    convertOldInterval(int, section),
  );

  const repeatCount = block.repeatCount ?? 1;

  if (repeatCount <= 1 && newInnerBlocks.length === 1) {
    return newInnerBlocks;
  }

  if (repeatCount > 1 || newInnerBlocks.length > 1) {
    const rg: RepeatGroup = {
      id: generateId(),
      blockType: 'repeat',
      repetitions: repeatCount,
      name: block.name,
      blocks: newInnerBlocks,
    };
    return [rg];
  }

  return newInnerBlocks;
}

/** Convert a single old-format Interval into a new Segment. */
function convertOldInterval(int: any, section: 'warmup' | 'main' | 'cooldown'): Segment {
  const oldType: string = int.type ?? 'easy';

  let segmentType: SegmentType;
  let intensity: Intensity | undefined;

  switch (oldType) {
    case 'warmup':
      segmentType = 'warmup';
      intensity = 'easy';
      break;
    case 'cooldown':
      segmentType = 'cooldown';
      intensity = 'easy';
      break;
    case 'hard': {
      segmentType = 'run';
      const effort = int.effort as number | undefined;
      if (effort && effort <= 3) intensity = 'moderate';
      else if (effort && effort <= 6) intensity = 'tempo';
      else intensity = 'hard';
      break;
    }
    case 'easy':
    default:
      if (section === 'warmup') {
        segmentType = 'warmup';
      } else if (section === 'cooldown') {
        segmentType = 'cooldown';
      } else {
        segmentType = 'recovery';
      }
      intensity = 'easy';
      break;
  }

  const durationSeconds: number = int.durationSeconds ?? 0;
  const distanceMeters: number | undefined = int.distanceMeters;

  let target: SegmentTarget;
  if (distanceMeters && distanceMeters > 0 && !durationSeconds) {
    target = { type: 'distance', distanceMeters };
  } else {
    target = { type: 'time', durationSeconds };
  }

  const targetPace: number | undefined = typeof int.targetPace === 'number' ? int.targetPace : undefined;

  // Intensity and target pace are mutually exclusive; an explicit pace wins.
  return {
    id: generateId(),
    blockType: 'segment',
    segmentType,
    label: int.label,
    target,
    intensity: targetPace != null ? undefined : intensity,
    targetPace,
  };
}

// ── Workouts (CRUD) ──────────────────────────────────────────────────

export async function loadWorkouts(): Promise<WorkoutDefinition[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.WORKOUTS);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as any[];
  return parsed.map(migrateToBlockModel);
}

export async function saveWorkouts(
  workouts: WorkoutDefinition[]
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.WORKOUTS,
    JSON.stringify(workouts)
  );
}

export async function saveWorkout(
  workout: WorkoutDefinition
): Promise<void> {
  const existing = await loadWorkouts();
  const idx = existing.findIndex((w) => w.id === workout.id);
  if (idx >= 0) {
    existing[idx] = workout;
  } else {
    existing.unshift(workout);
  }
  await saveWorkouts(existing);
}

export async function deleteWorkout(id: string): Promise<void> {
  const existing = await loadWorkouts();
  await saveWorkouts(existing.filter((w) => w.id !== id));

  import('../sync/cloudSync').then(({ trackWorkoutDeletion }) => {
    trackWorkoutDeletion(id);
  }).catch(() => {});
}

// ── History ──────────────────────────────────────────────────────────

let _historyLock: Promise<void> = Promise.resolve();

export function withHistoryLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = _historyLock;
  _historyLock = next;
  return prev.then(fn).finally(() => release!());
}

/**
 * Early 1.10.0 builds kept heart rate readings inside the history entry.
 * Move them to the run's sample file and keep only the summary.
 */
export function moveInlineHeartRate(entry: CompletedWorkout): CompletedWorkout {
  const hr = entry.heartRate as (CompletedWorkout['heartRate'] & { samples?: HrSample[] }) | undefined;
  if (!hr?.samples) return entry;
  const { samples, ...summary } = hr;
  if (!hasHeartRateSamples(entry.id)) saveHeartRateSamples(entry.id, samples);
  return { ...entry, heartRate: { ...summary, sampleCount: samples.length } };
}

export async function loadHistory(): Promise<CompletedWorkout[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.HISTORY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as CompletedWorkout[];
  return parsed.map((entry) => {
    if (entry.configuration) {
      entry.configuration = migrateToBlockModel(entry.configuration);
    }
    return moveInlineHeartRate(entry);
  });
}

export async function saveCompletedWorkout(
  entry: CompletedWorkout
): Promise<void> {
  return withHistoryLock(async () => {
    const history = await loadHistory();
    history.unshift(entry);
    if (history.length > 200) history.length = 200;
    await AsyncStorage.setItem(
      STORAGE_KEYS.HISTORY,
      JSON.stringify(history)
    );
  });
}

export async function updateHistoryEntry(
  id: string,
  updater: (entry: CompletedWorkout) => CompletedWorkout,
): Promise<CompletedWorkout[]> {
  return withHistoryLock(async () => {
    const history = await loadHistory();
    const idx = history.findIndex((h) => h.id === id);
    if (idx >= 0) {
      history[idx] = { ...updater(history[idx]), updatedAt: Date.now() };
      await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    }
    return history;
  });
}

export async function deleteHistoryEntry(id: string): Promise<CompletedWorkout[]> {
  const history = await loadHistory();
  const updated = history.filter((h) => h.id !== id);
  await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated));
  deleteHeartRateSamples(id);

  import('../sync/cloudSync').then(({ trackHistoryDeletion }) => {
    trackHistoryDeletion(id);
  }).catch(() => {});

  return updated;
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.HISTORY);
  clearAllHeartRateSamples();
}

export async function clearAllUserData(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.WORKOUTS,
    STORAGE_KEYS.HISTORY,
    '@pacecue/last_sync',
    '@pacecue/deleted_workout_ids',
    '@pacecue/deleted_history_ids',
    '@pacecue/plan_cache',
  ]);
  clearAllHeartRateSamples();
  await import('../heartRate/hrConsent')
    .then(({ clearHrCloudConsent }) => clearHrCloudConsent())
    .catch(() => {});
}

// ── Settings ─────────────────────────────────────────────────────────

const PROGRESS_CUE_BASES = new Set(['time', 'distance', 'auto']);
const CUE_DISTANCE_PRESETS = new Set(['off', 'quarter', 'half', 'full']);
const SPLIT_DISTANCE_PRESETS = new Set(['quarter', 'half', 'full']);
const AUDIO_CUE_MODES = new Set(['voice', 'beeps', 'both', 'silent']);

/** Fill defaults and drop unknown cue-schedule values from older saves. */
export function normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const parsed: AppSettings = { ...DEFAULT_SETTINGS, ...raw };
  if (typeof (parsed.countdownWarningSeconds as unknown) === 'number') {
    parsed.countdownWarningSeconds = [parsed.countdownWarningSeconds as unknown as number];
  }
  if (!PROGRESS_CUE_BASES.has(parsed.progressCueBasis)) parsed.progressCueBasis = 'time';
  if (!PROGRESS_CUE_BASES.has(parsed.paceCueBasis)) parsed.paceCueBasis = 'time';
  if (!CUE_DISTANCE_PRESETS.has(parsed.progressCueDistance)) parsed.progressCueDistance = 'full';
  if (!CUE_DISTANCE_PRESETS.has(parsed.paceCueDistance)) parsed.paceCueDistance = 'half';
  if (!SPLIT_DISTANCE_PRESETS.has(parsed.splitDistance)) parsed.splitDistance = DEFAULT_SETTINGS.splitDistance;
  if (!AUDIO_CUE_MODES.has(parsed.audioCueMode)) parsed.audioCueMode = DEFAULT_SETTINGS.audioCueMode;
  if (parsed.voiceEngine !== 'device' && parsed.voiceEngine !== 'premium') parsed.voiceEngine = 'premium';
  if (!PREMIUM_VOICES.some((v) => v.id === parsed.premiumVoiceId)) {
    parsed.premiumVoiceId = DEFAULT_PREMIUM_VOICE_ID;
  }
  return parsed;
}

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (!raw) return DEFAULT_SETTINGS;
  return normalizeSettings(JSON.parse(raw));
}

const settingsSavedListeners = new Set<() => void>();

/** Called after every successful saveSettings(). Returns an unsubscribe function. */
export function onSettingsSaved(listener: () => void): () => void {
  settingsSavedListeners.add(listener);
  return () => settingsSavedListeners.delete(listener);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.SETTINGS,
    JSON.stringify(normalizeSettings(settings))
  );
  settingsSavedListeners.forEach((listener) => listener());
}
