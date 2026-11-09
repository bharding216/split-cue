/**
 * Factory defaults for Quick Start workout tiles.
 *
 * Each type returns a fresh WorkoutDefinition with a new id.
 * These are NOT saved to the library — they serve as starting
 * configurations for session-only runs.
 *
 * Last-used defaults are managed via AsyncStorage in a separate
 * key so they don't pollute the workout library.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WorkoutDefinition,
  generateId,
  type QuickStartType,
  type Segment,
  type RepeatGroup,
  type SegmentTarget,
  type SegmentType,
  type Intensity,
  type WorkoutBlock,
} from './workoutTypes';
import { migrateToBlockModel } from './workoutStorage';

const DEFAULTS_KEY = '@pacecue/quick_start_defaults';

// ── Block-building helpers ───────────────────────────────────────────

function seg(
  segmentType: SegmentType,
  target: SegmentTarget,
  opts?: { label?: string; intensity?: Intensity },
): Segment {
  return {
    id: generateId(),
    blockType: 'segment',
    segmentType,
    target,
    label: opts?.label,
    intensity: opts?.intensity,
  };
}

function time(seconds: number): SegmentTarget {
  return { type: 'time', durationSeconds: seconds };
}

function dist(meters: number): SegmentTarget {
  return { type: 'distance', distanceMeters: meters };
}

function repeat(repetitions: number, blocks: WorkoutBlock[]): RepeatGroup {
  return { id: generateId(), blockType: 'repeat', repetitions, blocks };
}

/** Build a factory-fresh WorkoutDefinition for a Quick Start type. */
function factoryDefault(type: QuickStartType): WorkoutDefinition {
  const now = Date.now();
  const base = { id: generateId(), createdAt: now, updatedAt: now };

  switch (type) {
    case 'free_run':
      return {
        ...base,
        name: 'Free Run',
        category: 'easy',
        blocks: [
          seg('run', { type: 'manual' }, { label: 'Free Run', intensity: 'easy' }),
        ],
      };

    case 'distance':
      return {
        ...base,
        name: 'Distance Run',
        category: 'easy',
        blocks: [
          seg('run', dist(4828), { label: 'Easy Run', intensity: 'easy' }),
        ],
        targetDistanceMeters: 4828,
      };

    case 'timed':
      return {
        ...base,
        name: 'Timed Run',
        category: 'easy',
        blocks: [
          seg('run', time(1800), { label: 'Run', intensity: 'easy' }),
        ],
      };

    case 'intervals':
      return {
        ...base,
        name: 'Intervals',
        category: 'intervals',
        blocks: [
          seg('warmup', time(300)),
          repeat(6, [
            seg('run', time(180), { label: 'Hard', intensity: 'hard' }),
            seg('recovery', time(120), { label: 'Easy' }),
          ]),
          seg('cooldown', time(300)),
        ],
      };

    case 'tempo':
      return {
        ...base,
        name: 'Tempo Run',
        category: 'tempo',
        blocks: [
          seg('warmup', time(480)),
          seg('run', time(1200), { label: 'Tempo', intensity: 'tempo' }),
          seg('cooldown', time(300)),
        ],
      };

    case 'easy_run':
      return {
        ...base,
        name: 'Easy Run',
        category: 'easy',
        blocks: [
          seg('run', time(1800), { label: 'Easy Run', intensity: 'easy' }),
        ],
      };

    case 'custom':
    default:
      return {
        ...base,
        name: '',
        blocks: [
          seg('warmup', time(300)),
          repeat(4, [
            seg('run', time(180), { intensity: 'hard' }),
            seg('recovery', time(120)),
          ]),
          seg('cooldown', time(300)),
        ],
      };
  }
}

/**
 * Shorter versions of the factory defaults for someone who hasn't finished
 * a run yet, so the first one is easy to complete. Types not listed here
 * use the regular default.
 */
function newRunnerDefault(type: QuickStartType): WorkoutDefinition | null {
  const now = Date.now();
  const base = { id: generateId(), createdAt: now, updatedAt: now };

  switch (type) {
    case 'distance':
      return {
        ...base,
        name: 'Distance Run',
        category: 'easy',
        blocks: [
          seg('run', dist(3219), { label: 'Easy Run', intensity: 'easy' }),
        ],
        targetDistanceMeters: 3219,
      };

    case 'timed':
      return {
        ...base,
        name: 'Timed Run',
        category: 'easy',
        blocks: [
          seg('run', time(1200), { label: 'Run', intensity: 'easy' }),
        ],
      };

    case 'intervals':
      return {
        ...base,
        name: 'Intervals',
        category: 'intervals',
        blocks: [
          seg('warmup', time(300)),
          repeat(4, [
            seg('run', time(120), { label: 'Hard', intensity: 'hard' }),
            seg('recovery', time(120), { label: 'Easy' }),
          ]),
          seg('cooldown', time(300)),
        ],
      };

    case 'tempo':
      return {
        ...base,
        name: 'Tempo Run',
        category: 'tempo',
        blocks: [
          seg('warmup', time(300)),
          seg('run', time(600), { label: 'Tempo', intensity: 'tempo' }),
          seg('cooldown', time(300)),
        ],
      };

    case 'easy_run':
      return {
        ...base,
        name: 'Easy Run',
        category: 'easy',
        blocks: [
          seg('run', time(1200), { label: 'Easy Run', intensity: 'easy' }),
        ],
      };

    default:
      return null;
  }
}

/**
 * Return a factory workout draft for a Quick Start type, shortened for
 * runners who haven't finished a run yet.
 */
export function quickStartFactory(
  type: QuickStartType,
  opts?: { newRunner?: boolean },
): WorkoutDefinition {
  return (opts?.newRunner && newRunnerDefault(type)) || factoryDefault(type);
}

/** The run offered on the home screen to someone who hasn't finished a run yet. */
export function firstRunWorkout(): WorkoutDefinition {
  return { ...newRunnerDefault('easy_run')!, name: 'Your First Run' };
}

/**
 * Load the last-used default for a Quick Start type.
 * Returns undefined if no previous configuration has been saved.
 * Migrates old-format saved defaults to the new block model.
 */
export async function loadQuickStartDefault(type: QuickStartType): Promise<WorkoutDefinition | undefined> {
  const raw = await AsyncStorage.getItem(DEFAULTS_KEY);
  if (!raw) return undefined;
  try {
    const map: Record<string, any> = JSON.parse(raw);
    const saved = map[type];
    if (!saved) return undefined;
    const migrated = migrateToBlockModel(saved);
    return { ...migrated, id: generateId(), createdAt: Date.now(), updatedAt: Date.now() };
  } catch {
    return undefined;
  }
}

/** Persist the configuration as the last-used default for a Quick Start type. */
export async function saveQuickStartDefault(type: QuickStartType, workout: WorkoutDefinition): Promise<void> {
  const raw = await AsyncStorage.getItem(DEFAULTS_KEY);
  let map: Record<string, WorkoutDefinition> = {};
  if (raw) {
    try { map = JSON.parse(raw); } catch {}
  }
  map[type] = workout;
  await AsyncStorage.setItem(DEFAULTS_KEY, JSON.stringify(map));
}

/** All Quick Start tile definitions for the home screen. */
export const QUICK_START_TILES: { type: QuickStartType; label: string; icon: string; color: string }[] = [
  { type: 'distance', label: 'Distance', icon: 'navigate-outline', color: '#4ADE80' },
  { type: 'timed', label: 'Timed', icon: 'time-outline', color: '#60A5FA' },
  { type: 'intervals', label: 'Intervals', icon: 'repeat', color: '#F87171' },
  { type: 'tempo', label: 'Tempo', icon: 'speedometer-outline', color: '#FBBF24' },
  { type: 'easy_run', label: 'Easy Run', icon: 'leaf-outline', color: '#4ADE80' },
  { type: 'custom', label: 'Custom', icon: 'settings-outline', color: '#94A3B8' },
  { type: 'free_run', label: 'Free Run', icon: 'footsteps-outline', color: '#A78BFA' },
];
