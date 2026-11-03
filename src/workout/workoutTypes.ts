/**
 * Core data types for SplitCue workouts.
 *
 * The workout model uses a flat ordered list of Blocks. Each block is either
 * a Segment (a single effort with a completion target) or a RepeatGroup
 * (a set of blocks repeated N times). This cleanly separates structure,
 * purpose, and intensity.
 */

import { DEFAULT_PREMIUM_VOICE_ID } from '../audio/voiceCatalog';

// ── Segment model ────────────────────────────────────────────────────

/** The purpose of a segment within a workout. */
export type SegmentType = 'warmup' | 'run' | 'recovery' | 'rest' | 'cooldown';

/** How a segment ends. */
export type TargetType = 'time' | 'distance' | 'manual';

/** Named intensity levels. */
export type Intensity = 'recovery' | 'easy' | 'moderate' | 'tempo' | 'hard' | 'sprint';

/** Completion condition for a segment. */
export interface SegmentTarget {
  type: TargetType;
  durationSeconds?: number; // when type is 'time'
  distanceMeters?: number;  // when type is 'distance'
}

/** A single effort within a workout. */
export interface Segment {
  id: string;
  blockType: 'segment';
  segmentType: SegmentType;
  label?: string;
  target: SegmentTarget;
  intensity?: Intensity;
  effort?: number; // 1-10 numeric intensity
  targetPace?: number; // min/mile target pace
}

/** A group of blocks repeated a number of times. */
export interface RepeatGroup {
  id: string;
  blockType: 'repeat';
  repetitions: number;
  name?: string;
  blocks: WorkoutBlock[];
}

/** A block in a workout: either a single segment or a repeat group. */
export type WorkoutBlock = Segment | RepeatGroup;

// ── Legacy types (deprecated — kept for migration and downstream compat) ─

/** @deprecated Use SegmentType + Intensity instead. */
export type IntervalType = 'warmup' | 'hard' | 'easy' | 'cooldown';


// ── Workout definition ───────────────────────────────────────────────

export interface WorkoutDefinition {
  id: string;
  name: string;
  blocks: WorkoutBlock[];
  targetDistanceMeters?: number;
  category?: WorkoutCategory;
  createdAt: number;
  updatedAt: number;
}

// ── Label presets ────────────────────────────────────────────────────

/** Label presets grouped by segment type. */
export const SEGMENT_LABEL_OPTIONS: Record<SegmentType, readonly string[]> = {
  warmup: ['Warm Up', 'Easy Jog', 'Walk', 'Stride', 'Drills'],
  run: ['Run', 'Sprint', 'Stride', 'Tempo', 'Race Pace', 'Threshold', 'Hill', 'Speed', 'Build Up', 'Fartlek', 'Steady'],
  recovery: ['Walk', 'Jog', 'Recovery', 'Easy Run', 'Rest', 'Reset', 'Float'],
  rest: ['Rest', 'Stop'],
  cooldown: ['Cool Down', 'Easy Jog', 'Walk'],
} as const;


// ── Flattened interval (engine execution shape) ──────────────────────

/** One segment of a block, as spoken in the block's summary. */
export interface BlockSegmentSummary {
  label: string;
  durationSeconds: number;
  distanceMeters?: number;
  /** Omitted for easy segments, which the summary doesn't qualify. */
  intensity?: Intensity;
}

/** A flattened interval ready for the engine to execute sequentially. */
export interface FlatInterval {
  type: IntervalType;
  durationSeconds: number;
  distanceMeters?: number;
  label: string;
  effort?: number;
  targetPace?: number;
  index: number;
  blockName?: string;
  blockNumber: number;
  setNumber: number;
  totalSets: number;
  isFirstInSet: boolean;
  isFirstInBlock: boolean;
  blockSegments: BlockSegmentSummary[];
  blockIntervalCount: number;
  /** New: the segment type from the block model. */
  segmentType: SegmentType;
  /** New: the named intensity from the block model. */
  intensity?: Intensity;
}

// ── Engine state ─────────────────────────────────────────────────────

export type EnginePhase = 'idle' | 'running' | 'paused' | 'finished';

export interface EngineState {
  phase: EnginePhase;
  intervals: FlatInterval[];
  currentIndex: number;
  intervalEndsAt: number;
  pausedRemaining: number;
  totalElapsedMs: number;
  startedAt: number;
}

// ── GPS & history ────────────────────────────────────────────────────

export interface RoutePoint {
  lat: number;
  lng: number;
  alt: number | null;
  ts: number;
  dist: number;
}

export interface IntervalSplit {
  label: string;
  type: IntervalType;
  plannedDurationSec: number;
  actualDurationMs: number;
  distanceMeters: number | null;
  avgPaceMinPerMile: number | null;
  avgPaceMinPerKm: number | null;
  targetPace: number | undefined;
  effort: number | undefined;
}

// ── Workout Tags ─────────────────────────────────────────────────────

export type WorkoutTagCategory = 'feel' | 'type';

export interface WorkoutTagGroup {
  category: WorkoutTagCategory;
  label: string;
  icon: string;
  tags: readonly string[];
}

// Tag names match earlier presets so existing history keeps its colors.
// Anything more specific (weather, company, terrain) belongs in notes.
export const WORKOUT_TAG_GROUPS: readonly WorkoutTagGroup[] = [
  {
    category: 'feel',
    label: 'How It Felt',
    icon: 'heart-outline',
    tags: ['Strong', 'Good', 'OK', 'Tough'],
  },
  {
    category: 'type',
    label: 'Run Type',
    icon: 'footsteps-outline',
    tags: ['Easy Day', 'Long Run', 'Tempo', 'Speed Work', 'Race', 'Trail', 'Treadmill'],
  },
] as const;

export const ALL_PRESET_TAGS: readonly string[] = WORKOUT_TAG_GROUPS.flatMap((g) => g.tags);

export const WORKOUT_NOTES_MAX_LENGTH = 1000;

// ── Quick Start & Completed Workout ──────────────────────────────────

export type QuickStartType = 'distance' | 'timed' | 'intervals' | 'tempo' | 'easy_run' | 'custom';

export interface CompletedWorkout {
  id: string;
  workoutId: string;
  workoutName: string;
  completedAt: number;
  /** Last local edit (tags, notes, etc.); used by cloud sync to pick the newer copy. */
  updatedAt?: number;
  totalDurationMs: number;
  splits?: IntervalSplit[];
  totalDistanceMeters?: number;
  route?: RoutePoint[];
  tags?: string[];
  notes?: string;
  /** Set once the run has been uploaded, so it isn't uploaded twice. */
  stravaActivityId?: number;
  configuration?: WorkoutDefinition;
  templateId?: string;
  planWorkoutId?: string;
  quickStartType?: QuickStartType;
}

// ── Settings ─────────────────────────────────────────────────────────

export type AudioCueMode = 'voice' | 'beeps' | 'both' | 'silent';
export type TimeRemainingInterval = 0 | 15 | 30 | 45 | 60 | 120;
export type VoiceEngine = 'device' | 'premium';

import type {
  CueBasis,
  CueDistancePreset,
  PaceCueFrequency,
  PaceWindowSize,
  PaceUnit,
} from '../pace/paceTypes';

export interface AppSettings {
  audioCueMode: AudioCueMode;
  hapticEnabled: boolean;
  countdownWarningSeconds: number[];
  keepScreenOn: boolean;
  timeRemainingInterval: TimeRemainingInterval;
  /** Interval-progress cues: elapsed time, or distance covered in the interval. */
  progressCueBasis: CueBasis;
  /** Distance step for interval-progress cues. Used when progressCueBasis is 'distance'. */
  progressCueDistance: CueDistancePreset;
  voiceIdentifier: string | null;
  /** Speak cues with the device's TTS voice or the premium AI voice. */
  voiceEngine: VoiceEngine;
  premiumVoiceId: string;
  duckOtherAudio: boolean;
  paceTrackingEnabled: boolean;
  paceCueFrequency: PaceCueFrequency;
  /** Pace cues: every N seconds, or each time a distance is covered. */
  paceCueBasis: CueBasis;
  /** Distance step for pace cues. Used when paceCueBasis is 'distance'. */
  paceCueDistance: CueDistancePreset;
  paceWindow: PaceWindowSize;
  paceUnit: PaceUnit;
  paceCueOnlyWithTarget: boolean;
  /** Upload every finished run to Strava when it's connected. */
  stravaAutoUpload: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  audioCueMode: 'both',
  hapticEnabled: true,
  countdownWarningSeconds: [10],
  keepScreenOn: true,
  timeRemainingInterval: 60,
  progressCueBasis: 'time',
  progressCueDistance: 'full',
  voiceIdentifier: null,
  voiceEngine: 'premium',
  premiumVoiceId: DEFAULT_PREMIUM_VOICE_ID,
  duckOtherAudio: true,
  paceTrackingEnabled: true,
  paceCueFrequency: 30,
  paceCueBasis: 'time',
  paceCueDistance: 'half',
  paceWindow: 30,
  paceUnit: 'minPerMile',
  paceCueOnlyWithTarget: false,
  stravaAutoUpload: false,
};

// ── Segment helpers ──────────────────────────────────────────────────

/** Default user-facing label for a segment type. */
export function defaultSegmentLabel(st: SegmentType): string {
  switch (st) {
    case 'warmup': return 'Warm Up';
    case 'run': return 'Run';
    case 'recovery': return 'Recovery';
    case 'rest': return 'Rest';
    case 'cooldown': return 'Cool Down';
  }
}

/** Map a SegmentType + Intensity to the legacy IntervalType for engine/color compat. */
export function segmentToIntervalType(st: SegmentType, intensity?: Intensity): IntervalType {
  switch (st) {
    case 'warmup': return 'warmup';
    case 'cooldown': return 'cooldown';
    case 'rest':
    case 'recovery': return 'easy';
    case 'run':
      if (!intensity) return 'hard';
      return (intensity === 'recovery' || intensity === 'easy') ? 'easy' : 'hard';
  }
}

/** Get the durationSeconds for a segment (0 for distance/manual targets). */
function segmentDuration(seg: Segment): number {
  return seg.target.type === 'time' ? (seg.target.durationSeconds ?? 0) : 0;
}

/** Get the distanceMeters for a segment (undefined for time/manual targets). */
function segmentDistance(seg: Segment): number | undefined {
  return seg.target.type === 'distance' ? seg.target.distanceMeters : undefined;
}

/** Map named intensity to a numeric effort (1-10). */
export function intensityToEffort(intensity?: Intensity): number | undefined {
  if (!intensity) return undefined;
  switch (intensity) {
    case 'recovery': return 2;
    case 'easy': return 3;
    case 'moderate': return 5;
    case 'tempo': return 7;
    case 'hard': return 8;
    case 'sprint': return 10;
  }
}

/** Map a numeric effort (1-10) to the nearest named intensity. */
export function effortToIntensity(effort: number): Intensity {
  if (effort <= 2) return 'recovery';
  if (effort <= 3) return 'easy';
  if (effort <= 5) return 'moderate';
  if (effort <= 7) return 'tempo';
  if (effort <= 9) return 'hard';
  return 'sprint';
}

// ── Speech helpers ───────────────────────────────────────────────────

export function formatDurationForSpeech(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0 && secs > 0) {
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ${secs} ${secs === 1 ? 'second' : 'seconds'}`;
  } else if (mins > 0) {
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  }
  return `${secs} ${secs === 1 ? 'second' : 'seconds'}`;
}

export function formatTime(totalSeconds: number): string {
  const mins = Math.floor(Math.abs(totalSeconds) / 60);
  const secs = Math.floor(Math.abs(totalSeconds) % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Distance helpers ─────────────────────────────────────────────────

export const METERS_PER_MILE = 1609.344;
export const METERS_PER_KM = 1000;
export const DISTANCE_INTERVAL_MAX_MS = 12 * 60 * 60 * 1000;

export const RACE_DISTANCES = {
  '5K': 5000,
  '10K': 10000,
  'Half Marathon': 21097,
  'Marathon': 42195,
} as const;

export function isDistanceInterval(interval: { durationSeconds: number; distanceMeters?: number }): boolean {
  return !!(interval.distanceMeters && interval.distanceMeters > 0 && !interval.durationSeconds);
}

export function formatDistanceForSpeech(meters: number): string {
  if (Math.abs(meters - METERS_PER_MILE) < 10) return '1 mile';
  if (Math.abs(meters - METERS_PER_MILE * 0.5) < 10) return 'half mile';
  if (Math.abs(meters - METERS_PER_MILE * 0.25) < 10) return 'quarter mile';
  if (Math.abs(meters - 400) < 5) return '400 meters';
  if (Math.abs(meters - 800) < 5) return '800 meters';
  if (Math.abs(meters - 1000) < 5) return '1 kilometer';
  if (Math.abs(meters - 5000) < 50) return '5 K';
  if (Math.abs(meters - 10000) < 100) return '10 K';
  if (Math.abs(meters - 21097) < 100) return 'half marathon';
  if (Math.abs(meters - 42195) < 200) return 'marathon';
  if (meters >= METERS_PER_MILE) {
    const miles = meters / METERS_PER_MILE;
    const rounded = Math.round(miles * 10) / 10;
    return `${rounded} ${rounded === 1 ? 'mile' : 'miles'}`;
  }
  if (meters >= 1000) {
    const km = meters / METERS_PER_KM;
    return `${Math.round(km * 10) / 10} kilometers`;
  }
  return `${Math.round(meters)} meters`;
}

/**
 * Speak a cue distance in the runner's unit.
 * Mile steps use quarter-mile words ("half mile", "1 and a quarter miles").
 * Kilometer steps use meters under 1 km, then whole and half kilometers.
 */
export function formatCueDistanceForSpeech(
  meters: number,
  unit: 'minPerMile' | 'minPerKm',
): string {
  if (unit === 'minPerMile') {
    const quarters = Math.round((meters / METERS_PER_MILE) * 4);
    const whole = Math.floor(quarters / 4);
    const rem = ((quarters % 4) + 4) % 4;
    if (whole <= 0) {
      if (rem === 1) return 'quarter mile';
      if (rem === 2) return 'half mile';
      if (rem === 3) return 'three quarters of a mile';
      return formatDistanceForSpeech(meters);
    }
    if (rem === 0) return `${whole} ${whole === 1 ? 'mile' : 'miles'}`;
    const fraction = rem === 1 ? 'a quarter' : rem === 2 ? 'a half' : 'three quarters';
    return `${whole} and ${fraction} miles`;
  }

  if (meters < METERS_PER_KM) return `${Math.round(meters)} meters`;
  const quarters = Math.round((meters / METERS_PER_KM) * 4);
  const whole = Math.floor(quarters / 4);
  const rem = ((quarters % 4) + 4) % 4;
  if (whole <= 0) return `${Math.round(meters)} meters`;
  if (rem === 0) return `${whole} ${whole === 1 ? 'kilometer' : 'kilometers'}`;
  if (rem === 2) return `${whole} and a half kilometers`;
  return `${quarters / 4} kilometers`;
}

export function formatDistanceShort(meters: number, unit: 'minPerMile' | 'minPerKm'): string {
  if (unit === 'minPerMile') {
    return `${(meters / METERS_PER_MILE).toFixed(2)} mi`;
  }
  return `${(meters / METERS_PER_KM).toFixed(2)} km`;
}

// ── Flatten ──────────────────────────────────────────────────────────

/** Summarize a segment for spoken block summaries. */
function summarizeSegment(seg: Segment, withIntensity: boolean): BlockSegmentSummary {
  return {
    label: seg.label || defaultSegmentLabel(seg.segmentType),
    durationSeconds: segmentDuration(seg),
    distanceMeters: segmentDistance(seg),
    intensity: withIntensity && seg.intensity !== 'easy' ? seg.intensity : undefined,
  };
}

/**
 * Recursively flatten a list of WorkoutBlocks into sequential FlatIntervals.
 * RepeatGroups expand their children N times.
 */
function flattenBlockTree(
  blocks: WorkoutBlock[],
  startIdx: number,
  startBlockNumber: number,
): { items: FlatInterval[]; nextIdx: number; nextBlockNumber: number } {
  const items: FlatInterval[] = [];
  let idx = startIdx;
  let blockNum = startBlockNumber;

  for (const block of blocks) {
    if (block.blockType === 'segment') {
      const seg = block;
      items.push({
        type: segmentToIntervalType(seg.segmentType, seg.intensity),
        durationSeconds: segmentDuration(seg),
        distanceMeters: segmentDistance(seg),
        label: seg.label || defaultSegmentLabel(seg.segmentType),
        effort: seg.effort ?? (seg.intensity ? intensityToEffort(seg.intensity) : undefined),
        targetPace: seg.targetPace,
        index: idx++,
        blockName: undefined,
        blockNumber: blockNum,
        setNumber: 1,
        totalSets: 1,
        isFirstInSet: true,
        isFirstInBlock: true,
        blockSegments: [summarizeSegment(seg, false)],
        blockIntervalCount: 1,
        segmentType: seg.segmentType,
        intensity: seg.intensity,
      });
      blockNum++;
    } else {
      const rg = block;
      const innerSegments = collectSegments(rg.blocks);
      const summary = innerSegments.map((s) => summarizeSegment(s, true));

      for (let r = 0; r < rg.repetitions; r++) {
        let innerIdx = 0;
        for (const inner of rg.blocks) {
          if (inner.blockType === 'segment') {
            const seg = inner;
            items.push({
              type: segmentToIntervalType(seg.segmentType, seg.intensity),
              durationSeconds: segmentDuration(seg),
              distanceMeters: segmentDistance(seg),
              label: seg.label || defaultSegmentLabel(seg.segmentType),
              effort: seg.effort ?? (seg.intensity ? intensityToEffort(seg.intensity) : undefined),
              targetPace: seg.targetPace,
              index: idx++,
              blockName: rg.name,
              blockNumber: blockNum,
              setNumber: r + 1,
              totalSets: rg.repetitions,
              isFirstInSet: innerIdx === 0,
              isFirstInBlock: innerIdx === 0 && r === 0,
              blockSegments: summary,
              blockIntervalCount: innerSegments.length,
              segmentType: seg.segmentType,
              intensity: seg.intensity,
            });
            innerIdx++;
          } else {
            const nested = flattenBlockTree([inner], idx, blockNum);
            for (const fi of nested.items) {
              fi.blockNumber = blockNum;
              fi.setNumber = r + 1;
              fi.totalSets = rg.repetitions;
            }
            items.push(...nested.items);
            idx = nested.nextIdx;
            innerIdx += nested.items.length;
          }
        }
      }
      blockNum++;
    }
  }

  return { items, nextIdx: idx, nextBlockNumber: blockNum };
}

/** Collect all top-level segments from a list of blocks (for summaries). */
function collectSegments(blocks: WorkoutBlock[]): Segment[] {
  if (!Array.isArray(blocks)) return [];
  const result: Segment[] = [];
  for (const b of blocks) {
    if (b.blockType === 'segment') result.push(b);
    else result.push(...collectSegments(b.blocks));
  }
  return result;
}

/** Flatten a WorkoutDefinition into an ordered list of FlatIntervals. */
export function flattenWorkout(def: WorkoutDefinition): FlatInterval[] {
  if (!Array.isArray(def.blocks) || def.blocks.length === 0) return [];
  const result = flattenBlockTree(def.blocks, 0, 1);
  return result.items;
}

/** Calculate total duration of a workout in seconds. */
export function totalWorkoutSeconds(def: WorkoutDefinition): number {
  return flattenWorkout(def).reduce((sum, i) => sum + i.durationSeconds, 0);
}

// ── Block tree walkers ───────────────────────────────────────────────

/** Recursively walk the block tree, calling fn on every Segment. */
function walkSegments(blocks: WorkoutBlock[], fn: (seg: Segment, repeatMultiplier: number) => void, multiplier = 1): void {
  if (!Array.isArray(blocks)) return;
  for (const b of blocks) {
    if (b.blockType === 'segment') {
      fn(b, multiplier);
    } else {
      walkSegments(b.blocks, fn, multiplier * b.repetitions);
    }
  }
}

/** Whether a workout has any distance-based features. */
export function hasDistanceFeature(def: WorkoutDefinition): boolean {
  if (def.targetDistanceMeters) return true;
  let found = false;
  walkSegments(def.blocks, (seg) => {
    if (seg.target.type === 'distance' && seg.target.distanceMeters && seg.target.distanceMeters > 0) {
      found = true;
    }
  });
  return found;
}

/** Total target distance for the workout (if any). */
export function totalWorkoutDistanceMeters(def: WorkoutDefinition): number | null {
  if (def.targetDistanceMeters) return def.targetDistanceMeters;
  let total = 0;
  walkSegments(def.blocks, (seg, mult) => {
    if (seg.target.type === 'distance' && seg.target.distanceMeters) {
      total += seg.target.distanceMeters * mult;
    }
  });
  return total > 0 ? total : null;
}

// ── Workout categorization ───────────────────────────────────────────

export type WorkoutCategory = 'easy' | 'tempo' | 'intervals' | 'long_run' | 'race';

const LEGACY_CATEGORY_MAP: Record<string, WorkoutCategory> = {
  distance: 'easy',
  timed: 'easy',
};

export function categorizeWorkout(def: WorkoutDefinition): WorkoutCategory {
  if (def.category) {
    return LEGACY_CATEGORY_MAP[def.category] ?? def.category;
  }
  return inferCategory(def);
}

function inferCategory(def: WorkoutDefinition): WorkoutCategory {
  if (def.targetDistanceMeters) {
    const d = def.targetDistanceMeters;
    const isRaceDist =
      Math.abs(d - 5000) < 100 ||
      Math.abs(d - 10000) < 100 ||
      Math.abs(d - 21097) < 200 ||
      Math.abs(d - 42195) < 300;
    if (isRaceDist) return 'race';
  }

  if (!Array.isArray(def.blocks) || def.blocks.length === 0) return 'easy';

  // Check for repeat groups or multiple top-level blocks with runs
  const hasRepeats = def.blocks.some(
    (b) => b.blockType === 'repeat' && b.repetitions > 1 && b.blocks.length > 1
  );
  const runBlocks = def.blocks.filter(
    (b) => b.blockType === 'segment' && b.segmentType === 'run'
  );
  const repeatGroups = def.blocks.filter((b) => b.blockType === 'repeat');
  if (hasRepeats || repeatGroups.length > 1) return 'intervals';

  // Tempo: single run segment with hard-ish intensity
  const topSegments = def.blocks.filter((b) => b.blockType === 'segment') as Segment[];
  const runSegments = topSegments.filter((s) => s.segmentType === 'run');
  if (
    runSegments.length === 1 &&
    repeatGroups.length === 0 &&
    runSegments[0].intensity &&
    ['tempo', 'hard', 'sprint', 'moderate'].includes(runSegments[0].intensity)
  ) {
    return 'tempo';
  }

  // Long run: single easy/recovery run > 45 min or > 8 km
  if (runSegments.length === 1 && repeatGroups.length === 0) {
    const seg = runSegments[0];
    const isEasyIsh = !seg.intensity || seg.intensity === 'easy' || seg.intensity === 'recovery';
    const isLongTime = seg.target.type === 'time' && (seg.target.durationSeconds ?? 0) >= 2700;
    const isLongDist = seg.target.type === 'distance' && (seg.target.distanceMeters ?? 0) >= 8000;
    if (isEasyIsh && (isLongTime || isLongDist)) return 'long_run';
  }

  return 'easy';
}

// ── Block construction helpers ───────────────────────────────────────

/** Create a new Segment with sensible defaults. */
export function createSegment(
  segmentType: SegmentType = 'run',
  overrides?: Partial<Omit<Segment, 'id' | 'blockType'>>,
): Segment {
  return {
    id: generateId(),
    blockType: 'segment',
    segmentType,
    target: { type: 'time', durationSeconds: segmentType === 'rest' ? 60 : 180 },
    ...overrides,
  };
}

/** Starting values for a newly added segment of each type. */
export const SEGMENT_DEFAULTS: Record<SegmentType, { durationSeconds: number; intensity?: Intensity }> = {
  warmup: { durationSeconds: 600, intensity: 'easy' },
  run: { durationSeconds: 300, intensity: 'moderate' },
  recovery: { durationSeconds: 120, intensity: 'recovery' },
  rest: { durationSeconds: 60, intensity: 'recovery' },
  cooldown: { durationSeconds: 300, intensity: 'easy' },
};

/** Create a new Segment using the per-type smart defaults. */
export function createDefaultSegment(segmentType: SegmentType): Segment {
  const d = SEGMENT_DEFAULTS[segmentType];
  return createSegment(segmentType, {
    target: { type: 'time', durationSeconds: d.durationSeconds },
    intensity: d.intensity,
    effort: intensityToEffort(d.intensity),
  });
}

/** Create a new RepeatGroup with default run + recovery. */
export function createRepeatGroup(
  repetitions = 4,
  overrides?: Partial<Omit<RepeatGroup, 'id' | 'blockType'>>,
): RepeatGroup {
  return {
    id: generateId(),
    blockType: 'repeat',
    repetitions,
    blocks: [
      createSegment('run', { intensity: 'hard', target: { type: 'time', durationSeconds: 180 } }),
      createSegment('recovery', { target: { type: 'time', durationSeconds: 120 } }),
    ],
    ...overrides,
  };
}
