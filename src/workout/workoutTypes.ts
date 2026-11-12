/**
 * Core data types for SplitCue workouts.
 *
 * The workout model uses a flat ordered list of Blocks. Each block is either
 * a Segment (a single effort with a completion target) or a RepeatGroup
 * (a set of blocks repeated N times). This cleanly separates structure,
 * purpose, and intensity.
 */

import { DEFAULT_PREMIUM_VOICE_ID } from '../audio/voiceCatalog';
import type { WorkoutHeartRate } from '../heartRate/hrTypes';

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

/** Where a workout's structure came from, when it wasn't built by hand. */
export type WorkoutOrigin = 'ai_voice' | 'imported' | 'next_run_suggestion';

/** A sender's finished result, carried in a share link. */
export interface SharedResult {
  durationMs: number;
  distanceMeters?: number;
}

/** Who shared an imported workout, and the result they posted with it. */
export interface SharedFrom {
  code?: string;
  senderName?: string;
  result?: SharedResult;
}

export interface WorkoutDefinition {
  id: string;
  name: string;
  blocks: WorkoutBlock[];
  targetDistanceMeters?: number;
  category?: WorkoutCategory;
  origin?: WorkoutOrigin;
  sharedFrom?: SharedFrom;
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
  /** Manual target: no time or distance limit, ends when the runner taps Skip. */
  openEnded?: boolean;
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
  /** Segment type of the interval; absent on splits recorded before heart rate support. */
  segmentType?: SegmentType;
  /** Workout time when the interval started, excluding pauses (ms). */
  startElapsedMs?: number;
  /** Workout time when the interval ended, excluding pauses (ms). */
  endElapsedMs?: number;
  avgHr?: number;
  maxHr?: number;
  /** Recovery and rest only: how far heart rate fell over the interval (bpm). */
  hrRecoveryDrop?: number;
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

export type QuickStartType = 'free_run' | 'distance' | 'timed' | 'intervals' | 'tempo' | 'easy_run' | 'custom';

/** Conditions at the end of a run, from Apple WeatherKit. Stored in metric. */
export interface RunWeather {
  /** WeatherKit condition code, e.g. "PartlyCloudy". */
  conditionCode: string;
  temperatureC: number;
  feelsLikeC: number;
  /** Relative humidity, 0–1. */
  humidity: number;
  windSpeedKph: number;
  windGustKph?: number;
  precipitationMmPerHour: number;
  uvIndex: number;
  daylight: boolean;
  /** When WeatherKit observed these conditions (epoch ms). */
  observedAt: number;
}

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
  /** Only GPS runs have weather: it's looked up at the route's last point. */
  weather?: RunWeather;
  /** Recorded when a heart rate monitor was connected. */
  heartRate?: WorkoutHeartRate;
}

// ── Settings ─────────────────────────────────────────────────────────

export type AudioCueMode = 'voice' | 'beeps' | 'both' | 'silent';
export type TimeRemainingInterval = 0 | 15 | 30 | 45 | 60 | 120;
export type VoiceEngine = 'device' | 'premium';

import type {
  CueDistancePreset,
  PaceCueFrequency,
  ProgressCueBasis,
  PaceWindowSize,
  PaceUnit,
  SplitDistancePreset,
} from '../pace/paceTypes';

export interface AppSettings {
  audioCueMode: AudioCueMode;
  hapticEnabled: boolean;
  countdownWarningSeconds: number[];
  keepScreenOn: boolean;
  timeRemainingInterval: TimeRemainingInterval;
  /** Interval-progress cues: elapsed time, distance covered in the interval, or whichever matches the interval's goal. */
  progressCueBasis: ProgressCueBasis;
  /** Distance step for interval-progress cues. Used when progressCueBasis is 'distance' or 'auto'. */
  progressCueDistance: CueDistancePreset;
  voiceIdentifier: string | null;
  /** Speak cues with the device's TTS voice or the premium AI voice. */
  voiceEngine: VoiceEngine;
  premiumVoiceId: string;
  duckOtherAudio: boolean;
  paceTrackingEnabled: boolean;
  paceCueFrequency: PaceCueFrequency;
  /** Pace cues: every N seconds, each time a distance is covered, or whichever matches the interval's goal. */
  paceCueBasis: ProgressCueBasis;
  /** Distance step for pace cues. Used when paceCueBasis is 'distance' or 'auto'. */
  paceCueDistance: CueDistancePreset;
  paceWindow: PaceWindowSize;
  paceUnit: PaceUnit;
  paceCueOnlyWithTarget: boolean;
  /** Upload every finished run to Strava when it's connected. */
  stravaAutoUpload: boolean;
  /** Last split length picked on Run Details. */
  splitDistance: SplitDistancePreset;
}

export const DEFAULT_SETTINGS: AppSettings = {
  audioCueMode: 'both',
  hapticEnabled: true,
  countdownWarningSeconds: [10],
  keepScreenOn: true,
  timeRemainingInterval: 60,
  progressCueBasis: 'auto',
  progressCueDistance: 'full',
  voiceIdentifier: null,
  voiceEngine: 'premium',
  premiumVoiceId: DEFAULT_PREMIUM_VOICE_ID,
  duckOtherAudio: true,
  paceTrackingEnabled: true,
  paceCueFrequency: 30,
  paceCueBasis: 'auto',
  paceCueDistance: 'half',
  paceWindow: 30,
  paceUnit: 'minPerMile',
  paceCueOnlyWithTarget: false,
  stravaAutoUpload: false,
  splitDistance: 'full',
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

/** Whether an interval has no time limit: it ends on distance, or when the runner taps Skip. */
export function isUntimedInterval(interval: { durationSeconds: number; distanceMeters?: number; openEnded?: boolean }): boolean {
  return isDistanceInterval(interval) || !!interval.openEnded;
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
        openEnded: seg.target.type === 'manual' || undefined,
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
              openEnded: seg.target.type === 'manual' || undefined,
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

/**
 * Number of work efforts in the workout: 'run' segments, counted once per
 * repetition. Warmup, cooldown, recovery, and rest don't count.
 */
export function workRepCount(def: WorkoutDefinition): number {
  let count = 0;
  walkSegments(def.blocks, (seg, mult) => {
    if (seg.segmentType === 'run') count += mult;
  });
  return count;
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

/** 'other' is for workouts whose type can't be determined; never guess 'easy'. */
export type WorkoutCategory = 'easy' | 'tempo' | 'intervals' | 'long_run' | 'race' | 'other';

export const WORKOUT_CATEGORIES: readonly WorkoutCategory[] = [
  'easy', 'tempo', 'intervals', 'long_run', 'race', 'other',
];

const LEGACY_CATEGORY_MAP: Record<string, WorkoutCategory> = {
  distance: 'easy',
  timed: 'easy',
};

/** Normalize a stored or AI-provided category; undefined when unrecognized. */
export function parseWorkoutCategory(value: unknown): WorkoutCategory | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((WORKOUT_CATEGORIES as readonly string[]).includes(v)) return v as WorkoutCategory;
  return LEGACY_CATEGORY_MAP[v];
}

export function categorizeWorkout(def: WorkoutDefinition): WorkoutCategory {
  return parseWorkoutCategory(def.category) ?? inferCategory(def);
}

/**
 * Pin the effective category onto a copy that's leaving its original context
 * (e.g. a calendar workout saved to My Workouts), so later edits to the name
 * or blocks don't silently reclassify it.
 */
export function withResolvedCategory(def: WorkoutDefinition): WorkoutDefinition {
  const category = categorizeWorkout(def);
  return { ...def, category: category === 'other' ? undefined : category };
}

const CATEGORY_KEYWORDS: [RegExp, WorkoutCategory][] = [
  [/\b(race(?!\s*pace)|time[\s-]?trial|parkrun)\b/i, 'race'],
  [/\blong[\s-]?run\b/i, 'long_run'],
  [/\b(tempo|threshold|lactate|cruise)\b/i, 'tempo'],
  [/\b(intervals?|repeats?|reps|fartlek|hills?|track|speed|vo2|ladder|pyramid)\b/i, 'intervals'],
  [/\blong\b/i, 'long_run'],
  [/\b(easy|recovery|shake[\s-]?out|aerobic|base)\b/i, 'easy'],
];

function categoryFromText(text: string | undefined): WorkoutCategory | undefined {
  if (!text) return undefined;
  return CATEGORY_KEYWORDS.find(([re]) => re.test(text))?.[1];
}

const HARDISH_INTENSITIES: ReadonlySet<Intensity> = new Set(['moderate', 'tempo', 'hard', 'sprint']);

function inferCategory(def: WorkoutDefinition): WorkoutCategory {
  // What the workout is called is the clearest statement of what it is.
  const fromName = categoryFromText(def.name);
  if (fromName) return fromName;

  if (def.targetDistanceMeters) {
    const d = def.targetDistanceMeters;
    const isRaceDist =
      Math.abs(d - 5000) < 100 ||
      Math.abs(d - 10000) < 100 ||
      Math.abs(d - 21097) < 200 ||
      Math.abs(d - 42195) < 300;
    if (isRaceDist) return 'race';
  }

  if (!Array.isArray(def.blocks) || def.blocks.length === 0) return 'other';

  const hasRepeats = def.blocks.some(
    (b) => b.blockType === 'repeat' && b.repetitions > 1 && b.blocks.length > 1
  );
  const repeatGroups = def.blocks.filter((b) => b.blockType === 'repeat');
  if (hasRepeats || repeatGroups.length > 1) return 'intervals';

  const runs: Segment[] = [];
  let runSeconds = 0;
  let runMeters = 0;
  walkSegments(def.blocks, (seg, mult) => {
    if (seg.segmentType !== 'run') return;
    runs.push(seg);
    if (seg.target.type === 'time') runSeconds += (seg.target.durationSeconds ?? 0) * mult;
    if (seg.target.type === 'distance') runMeters += (seg.target.distanceMeters ?? 0) * mult;
  });
  if (runs.length === 0) return 'other';

  const hardish = runs.filter((s) => s.intensity && HARDISH_INTENSITIES.has(s.intensity));
  if (hardish.length > 0) {
    const fast = hardish.some((s) => s.intensity === 'hard' || s.intensity === 'sprint');
    return hardish.length > 1 && fast ? 'intervals' : 'tempo';
  }

  // Segments with a target pace but no named intensity (common in AI workouts)
  // are often named for what they are.
  for (const seg of runs) {
    const fromLabel = categoryFromText(seg.label);
    if (fromLabel) return fromLabel;
  }

  const noHardSignal = runs.every(
    (s) => s.intensity === 'easy' || s.intensity === 'recovery' || (!s.intensity && s.targetPace == null),
  );
  if (noHardSignal && (runSeconds >= 2700 || runMeters >= 8000)) return 'long_run';
  if (runs.every((s) => s.intensity === 'easy' || s.intensity === 'recovery')) return 'easy';

  return 'other';
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
