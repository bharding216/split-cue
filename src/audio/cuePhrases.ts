/**
 * Spoken cue text, kept pure so the same strings are used both to
 * pre-generate premium voice clips and to play them at cue time.
 * The exact text of each phrase is its clip cache key.
 *
 * Cues are stitched from short pieces ("Starting Run for", "3 minutes",
 * "8 out of 10 effort.") rather than spoken as whole sentences, so a clip
 * generated for one workout is reused by every workout that says the same
 * piece. Each piece is generated with fixed sample context instead of its
 * real neighbors, which keeps its cache key independent of the workout.
 */

import type { PaceUnit } from '../pace/paceTypes';
import { formatPaceForSpeech } from '../pace/paceTracker';
import { paceToUnit } from '../workout/goalPaceSuggestions';
import {
  type AppSettings,
  type BlockSegmentSummary,
  type FlatInterval,
  type Intensity,
  type SegmentType,
  type WorkoutDefinition,
  flattenWorkout,
  isDistanceInterval,
  defaultSegmentLabel,
  formatDistanceForSpeech,
  formatCueDistanceForSpeech,
  METERS_PER_KM,
  METERS_PER_MILE,
} from '../workout/workoutTypes';
import { cueDistanceMeters } from './cueSchedule';
import { type Clip, clipKey } from './clipKey';

export interface CueContext {
  /** The label of the interval that just started (e.g. "Hard", "Easy", "Warm Up"). */
  currentLabel?: string;
  /** The label of the interval that just ended. */
  previousLabel?: string;
  // Verbose cue fields
  currentDuration?: number; // seconds (0 for distance-based)
  currentDistanceMeters?: number; // set for distance-based intervals
  effort?: number; // 1-10 perceived effort rating
  blockName?: string;
  blockNumber?: number;
  setNumber?: number;
  totalSets?: number;
  isFirstInBlock?: boolean;
  isFirstInSet?: boolean;
  blockSegments?: BlockSegmentSummary[];
  blockIntervalCount?: number;
  nextLabel?: string;
  nextDuration?: number;
  nextDistanceMeters?: number; // distance for next interval (if distance-based)
  nextEffort?: number; // effort for the next interval
  nextTargetPace?: number; // target pace in min/unit for the next interval
  warningSeconds?: number;
  targetPace?: number; // target pace in min/unit for current interval
  paceUnit?: PaceUnit; // unit for target pace announcement
}

/** A spoken phrase: the clips that play it in the premium voice, and the text device TTS speaks. */
export interface CuePhrase {
  clips: Clip[];
  text: string;
}

export const WORKOUT_COMPLETE_TEXT = 'Workout complete. Great job.';
export const PACE_UNAVAILABLE_TEXT = 'Pace unavailable';
export const ACQUIRING_GPS_TEXT = 'Acquiring GPS';
export const VOICE_PREVIEW_TEXT = 'Starting warmup.';

/** Upper bound for untimed intervals when listing time-progress phrases ahead of a run. */
const UNTIMED_PROGRESS_LIMIT_SECONDS = 30 * 60;
const DISTANCE_PROGRESS_LIMIT: Record<PaceUnit, number> = {
  minPerMile: 10 * 1609.344,
  minPerKm: 15000,
};
const PACE_SEGMENT_MAX_MINUTES = 30;
/** Generate pace segments with ElevenLabs previous/next text so joins sound continuous. */
const PACE_SEGMENT_CONTEXT = true;

// Ranges of the shared vocabulary bundled with the app. Values outside
// these are still stitched from pieces, just downloaded on first use.
const SHARED_MAX_MINUTES = 60;
const SHARED_MAX_SETS = 20;
const SHARED_MAX_BLOCK_NUMBER = 10;
/** Countdown warnings above the 3-2-1 beeps that settings offer. */
const SHARED_WARNING_SECONDS = [5, 10, 15, 30];
/** Remainders of the 15-second-multiple progress steps settings offer. */
const SHARED_PROGRESS_SECONDS = [15, 30, 45];
const SEGMENT_TYPES: SegmentType[] = ['warmup', 'run', 'recovery', 'rest', 'cooldown'];
/** Intensities a block summary names; easy segments go unqualified. */
const SUMMARY_INTENSITIES: Intensity[] = ['recovery', 'moderate', 'tempo', 'hard', 'sprint'];

export function buildCueContext(
  ci: FlatInterval,
  ni: FlatInterval | null | undefined,
  paceUnit?: PaceUnit,
): CueContext {
  return {
    currentLabel: ci.label,
    currentDuration: ci.durationSeconds,
    currentDistanceMeters: ci.distanceMeters,
    effort: ci.effort,
    blockName: ci.blockName,
    blockNumber: ci.blockNumber,
    setNumber: ci.setNumber,
    totalSets: ci.totalSets,
    isFirstInBlock: ci.isFirstInBlock,
    isFirstInSet: ci.isFirstInSet,
    blockSegments: ci.blockSegments,
    blockIntervalCount: ci.blockIntervalCount,
    nextLabel: ni?.label,
    nextDuration: ni?.durationSeconds,
    nextDistanceMeters: ni?.distanceMeters,
    nextEffort: ni?.effort,
    nextTargetPace: ni?.targetPace != null ? paceToUnit(ni.targetPace, paceUnit ?? 'minPerMile') : undefined,
    targetPace: ci.targetPace != null ? paceToUnit(ci.targetPace, paceUnit ?? 'minPerMile') : undefined,
    paceUnit,
  };
}

function paceUnitLabel(unit: PaceUnit | undefined): string {
  return unit === 'minPerKm' ? 'per K' : 'per mile';
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// ── Pieces ───────────────────────────────────────────────────────────

/** One stitched piece of a cue: its clip, and its text for device TTS. */
interface Piece {
  clip: Clip;
  text: string;
}

function piece(text: string, previousText?: string, nextText?: string): Piece {
  return { clip: previousText || nextText ? { text, previousText, nextText } : text, text };
}

function toPhrase(pieces: Piece[]): CuePhrase {
  return { clips: pieces.map((p) => p.clip), text: pieces.map((p) => p.text).join(' ') };
}

const MEASURE_BEFORE = 'Starting Run for';
const MEASURE_AFTER = '8 out of 10 effort.';

/** "3 minutes", or "3 minutes." when it ends the sentence. */
function minutesPiece(minutes: number, final: boolean): Piece {
  const text = plural(minutes, 'minute');
  return final ? piece(`${text}.`, MEASURE_BEFORE) : piece(text, MEASURE_BEFORE, '30 seconds.');
}

function secondsPiece(seconds: number, final: boolean): Piece {
  const text = plural(seconds, 'second');
  const before = `${MEASURE_BEFORE} 3 minutes`;
  return final ? piece(`${text}.`, before) : piece(text, before, MEASURE_AFTER);
}

function distancePiece(meters: number, final: boolean): Piece {
  const text = formatDistanceForSpeech(meters);
  return final ? piece(`${text}.`, MEASURE_BEFORE) : piece(text, MEASURE_BEFORE, MEASURE_AFTER);
}

/** An interval's length as pieces, e.g. [3 minutes] [30 seconds]. Empty when it has none. */
function measurePieces(durationSeconds: number | undefined, distanceMeters: number | undefined, final: boolean): Piece[] {
  const seconds = Math.round(durationSeconds ?? 0);
  if (seconds <= 0) {
    return distanceMeters && distanceMeters > 0 ? [distancePiece(distanceMeters, final)] : [];
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const pieces: Piece[] = [];
  if (mins > 0) pieces.push(minutesPiece(mins, final && secs === 0));
  if (secs > 0) pieces.push(secondsPiece(secs, final));
  return pieces;
}

function blockTitlePiece(title: string): Piece {
  return piece(`Beginning ${title}.`);
}

function setsPiece(totalSets: number): Piece {
  return piece(`${totalSets} sets.`, '3 minutes Run, 2 minutes Recovery.');
}

function setNumberPiece(setNumber: number): Piece {
  return piece(`Beginning set ${setNumber}`, undefined, 'of 4.');
}

function setTotalPiece(totalSets: number): Piece {
  return piece(`of ${totalSets}.`, 'Beginning set 2');
}

function startingPiece(label: string): Piece {
  return piece(`Starting ${label} for`, undefined, '3 minutes.');
}

function startEffortPiece(effort: number): Piece {
  return piece(`${effort} out of 10 effort.`, `${MEASURE_BEFORE} 3 minutes`);
}

function nextUpPiece(label: string): Piece {
  return piece(`Next up, ${label} for`, '10 seconds.', '2 minutes.');
}

function nextEffortPiece(effort: number): Piece {
  return piece(`${effort} out of 10.`, 'Next up, Recovery for 2 minutes');
}

function warningSecondsPiece(seconds: number): Piece {
  return piece(`${seconds} seconds.`);
}

function almostDonePiece(): Piece {
  return piece('Almost done.', '10 seconds.');
}

function endingPiece(label: string): Piece {
  return piece(`Ending ${label}.`, '10 seconds.');
}

function minutesPassedPiece(minutes: number): Piece {
  return piece(`${plural(minutes, 'minute')} passed.`);
}

function secondsPassedPiece(seconds: number): Piece {
  return piece(`${plural(seconds, 'second')} passed.`, '3 minutes');
}

function summaryLabelPiece(label: string, intensity: Intensity | undefined, last: boolean): Piece {
  return piece(`${label}${intensity ? ` at ${intensity}` : ''}${last ? '.' : ','}`, '3 minutes');
}

/** "3 minutes Run at tempo, 2 minutes Recovery." */
function blockSummaryPieces(segments: BlockSegmentSummary[]): Piece[] {
  return segments.flatMap((seg, i) => [
    ...measurePieces(seg.durationSeconds, seg.distanceMeters, false),
    summaryLabelPiece(seg.label, seg.intensity, i === segments.length - 1),
  ]);
}

// ── Cues ─────────────────────────────────────────────────────────────

/**
 * Interval transition announcement.
 *
 * Examples:
 *   Block start: "Beginning Sprint. 3 minutes hard, 2 minutes easy. 4 sets. Starting hard for 3 minutes."
 *   Set start:   "Beginning set 2 of 4. Starting hard for 3 minutes."
 *   Interval:    "Starting easy for 2 minutes."
 */
export function intervalStartCue(ctx: CueContext): CuePhrase | null {
  const measure = (final: boolean) => measurePieces(ctx.currentDuration, ctx.currentDistanceMeters, final);
  if (measure(true).length === 0) {
    return ctx.currentLabel ? toPhrase([blockTitlePiece(ctx.currentLabel)]) : null;
  }

  const pieces: Piece[] = [];
  const blockTitle = ctx.blockName || `interval ${ctx.blockNumber}`;
  const totalSets = ctx.totalSets ?? 1;
  if (ctx.isFirstInBlock && totalSets > 1) {
    pieces.push(blockTitlePiece(blockTitle), ...blockSummaryPieces(ctx.blockSegments ?? []), setsPiece(totalSets));
  } else if (ctx.isFirstInBlock && (ctx.blockIntervalCount ?? 0) > 1) {
    pieces.push(blockTitlePiece(blockTitle));
  } else if (ctx.isFirstInSet && totalSets > 1) {
    pieces.push(setNumberPiece(ctx.setNumber ?? 1), setTotalPiece(totalSets));
  }

  pieces.push(startingPiece(ctx.currentLabel ?? ''), ...measure(!ctx.effort));
  if (ctx.effort) pieces.push(startEffortPiece(ctx.effort));
  if (ctx.targetPace != null && isFinite(ctx.targetPace)) {
    pieces.push(...targetPacePieces(ctx.targetPace, ctx.paceUnit));
  }
  return toPhrase(pieces);
}

/** Countdown warning, e.g. "10 seconds. Next up, easy for 2 minutes." */
export function warningCue(ctx: CueContext): CuePhrase | null {
  const pieces: Piece[] = [];
  if (ctx.warningSeconds) pieces.push(warningSecondsPiece(ctx.warningSeconds));

  const nextMeasure = (final: boolean) => measurePieces(ctx.nextDuration, ctx.nextDistanceMeters, final);
  if (ctx.nextLabel && nextMeasure(true).length > 0) {
    pieces.push(nextUpPiece(ctx.nextLabel), ...nextMeasure(!ctx.nextEffort));
    if (ctx.nextEffort) pieces.push(nextEffortPiece(ctx.nextEffort));
    if (ctx.nextTargetPace != null && isFinite(ctx.nextTargetPace)) {
      pieces.push(...targetPacePieces(ctx.nextTargetPace, ctx.paceUnit));
    }
  } else if (!ctx.nextLabel) {
    pieces.push(almostDonePiece());
  } else if (ctx.currentLabel) {
    pieces.push(endingPiece(ctx.currentLabel));
  }
  return pieces.length > 0 ? toPhrase(pieces) : null;
}

/** Spoken in beeps-only mode so users can tell which countdown fired. */
export function warningSecondsCue(seconds: number): CuePhrase {
  return toPhrase([warningSecondsPiece(seconds)]);
}

/** "1 minute passed.", "1 minute 30 seconds passed.", "45 seconds passed." */
export function intervalProgressCue(elapsedSeconds: number): CuePhrase {
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  if (secs === 0) return toPhrase([minutesPassedPiece(mins)]);
  const pieces = mins > 0 ? [minutesPiece(mins, false)] : [];
  pieces.push(secondsPassedPiece(secs));
  return toPhrase(pieces);
}

/** "half mile passed", "1 kilometer passed", "500 meters passed". */
export function distanceProgressPhrase(meters: number, unit: PaceUnit): string {
  return `${formatCueDistanceForSpeech(meters, unit)} passed`;
}

/** Remaining distance below this is too small to announce. */
const MIN_REMAINING_METERS = 10;

/** Quarter steps keep cue wording ("2 and a half miles"); anything else is spoken to a tenth. */
function remainingDistanceForSpeech(meters: number, unit: PaceUnit): string {
  const quarter = cueDistanceMeters('quarter', unit);
  const offStep = Math.abs(meters - Math.round(meters / quarter) * quarter);
  if (offStep < MIN_REMAINING_METERS) return formatCueDistanceForSpeech(meters, unit);
  if (unit === 'minPerKm') {
    if (meters < METERS_PER_KM) return `${Math.round(meters / 10) * 10} meters`;
    return `${Math.round((meters / METERS_PER_KM) * 10) / 10} kilometers`;
  }
  const miles = Math.round((meters / METERS_PER_MILE) * 10) / 10;
  if (miles < 0.1) return `${Math.round(meters / 10) * 10} meters`;
  return `${miles} ${miles === 1 ? 'mile' : 'miles'}`;
}

function toGoPiece(meters: number, unit: PaceUnit): Piece {
  return piece(`${remainingDistanceForSpeech(meters, unit)} to go.`, '14 minutes 52 seconds.');
}

/** "1 mile passed. 14 minutes 52 seconds. 3 miles to go." */
export function distanceSplitCue(
  meters: number,
  elapsedSeconds: number,
  unit: PaceUnit,
  goalMeters?: number,
): CuePhrase {
  const distance = distanceProgressPhrase(meters, unit);
  const pieces: Piece[] = [
    { clip: distance, text: `${distance}.` },
    ...measurePieces(elapsedSeconds, undefined, true),
  ];
  const remaining = (goalMeters ?? 0) - meters;
  if (remaining >= MIN_REMAINING_METERS) pieces.push(toGoPiece(remaining, unit));
  return toPhrase(pieces);
}

/**
 * Factual pace cue — just the current pace, no judgment.
 *   "Current pace 7 minutes 35 seconds per mile"
 *   "Acquiring GPS" (no pace yet this run)
 *   "Pace unavailable" (pace was available, then lost)
 */
export function paceCuePhrase(
  currentPaceMinutes: number | null,
  unit: PaceUnit,
  acquiringGps = false,
): string {
  if (currentPaceMinutes == null || !isFinite(currentPaceMinutes)) {
    return acquiringGps ? ACQUIRING_GPS_TEXT : PACE_UNAVAILABLE_TEXT;
  }
  return `Current pace ${formatPaceForSpeech(currentPaceMinutes)} ${paceUnitLabel(unit)}`;
}

// ── Pace segments ────────────────────────────────────────────────────

function currentPacePrefix(unit: PaceUnit): Piece {
  return PACE_SEGMENT_CONTEXT
    ? piece('Current pace', undefined, `7 minutes 30 seconds ${paceUnitLabel(unit)}.`)
    : piece('Current pace');
}

function targetPacePrefix(unit: PaceUnit): Piece {
  return piece('Target pace', undefined, `7 minutes 30 seconds ${paceUnitLabel(unit)}.`);
}

function paceMinutesSegment(minutes: number, unit: PaceUnit): Piece {
  const text = plural(minutes, 'minute');
  return PACE_SEGMENT_CONTEXT
    ? piece(text, 'Current pace', `30 seconds ${paceUnitLabel(unit)}.`)
    : piece(text);
}

function paceSecondsSegment(seconds: number, unit: PaceUnit): Piece {
  const text = plural(seconds, 'second');
  return PACE_SEGMENT_CONTEXT
    ? piece(text, 'Current pace 7 minutes', `${paceUnitLabel(unit)}.`)
    : piece(text);
}

function paceSuffixSegment(unit: PaceUnit): Piece {
  const text = paceUnitLabel(unit);
  return PACE_SEGMENT_CONTEXT ? piece(text, 'Current pace 7 minutes 30 seconds') : piece(text);
}

/** [prefix] [7 minutes] [39 seconds] [per mile], or null when the pace is out of segment range. */
function pacePieces(prefix: Piece, paceMinutes: number, unit: PaceUnit): Piece[] | null {
  const total = Math.round(paceMinutes * 60);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins < 1 || mins > PACE_SEGMENT_MAX_MINUTES) return null;
  const pieces = [prefix, paceMinutesSegment(mins, unit)];
  if (secs > 0) pieces.push(paceSecondsSegment(secs, unit));
  pieces.push(paceSuffixSegment(unit));
  return pieces;
}

function targetPacePieces(paceMinutes: number, unit: PaceUnit = 'minPerMile'): Piece[] {
  return (
    pacePieces(targetPacePrefix(unit), paceMinutes, unit) ?? [
      piece(`Target pace ${formatPaceForSpeech(paceMinutes)} ${paceUnitLabel(unit)}.`),
    ]
  );
}

/** Pace cue as stitched clips: [Current pace] [7 minutes] [39 seconds] [per mile]. */
export function paceCue(
  currentPaceMinutes: number | null,
  unit: PaceUnit,
  acquiringGps = false,
): CuePhrase {
  const text = paceCuePhrase(currentPaceMinutes, unit, acquiringGps);
  if (currentPaceMinutes == null || !isFinite(currentPaceMinutes)) {
    return { clips: [text], text };
  }
  const pieces = pacePieces(currentPacePrefix(unit), currentPaceMinutes, unit);
  return pieces ? { clips: pieces.map((p) => p.clip), text } : { clips: [text], text };
}

// ── Clip lists for pre-generation ────────────────────────────────────

/** Pieces any workout can use, independent of its labels and names. */
function sharedCuePieces(unit: PaceUnit): Piece[] {
  const labels = SEGMENT_TYPES.map(defaultSegmentLabel);
  return [
    ...range(1, SHARED_MAX_MINUTES).flatMap((m) => [
      minutesPiece(m, false),
      minutesPiece(m, true),
      minutesPassedPiece(m),
    ]),
    ...range(1, 59).flatMap((s) => [secondsPiece(s, false), secondsPiece(s, true)]),
    ...SHARED_PROGRESS_SECONDS.map(secondsPassedPiece),
    ...range(1, 10).flatMap((e) => [startEffortPiece(e), nextEffortPiece(e)]),
    ...range(1, SHARED_MAX_SETS).map(setNumberPiece),
    ...range(2, SHARED_MAX_SETS).flatMap((n) => [setTotalPiece(n), setsPiece(n)]),
    ...range(1, SHARED_MAX_BLOCK_NUMBER).map((n) => blockTitlePiece(`interval ${n}`)),
    ...labels.flatMap((label) => [startingPiece(label), nextUpPiece(label), endingPiece(label)]),
    ...labels.flatMap((label) =>
      [undefined, ...SUMMARY_INTENSITIES].flatMap((intensity) => [
        summaryLabelPiece(label, intensity, false),
        summaryLabelPiece(label, intensity, true),
      ]),
    ),
    ...SHARED_WARNING_SECONDS.map(warningSecondsPiece),
    almostDonePiece(),
    targetPacePrefix(unit),
  ];
}

/** Clips shared by every workout: completion, pace segments, cue pieces, and distance progress. */
export function globalPackClips(unit: PaceUnit): Clip[] {
  const clips: Clip[] = [
    WORKOUT_COMPLETE_TEXT,
    PACE_UNAVAILABLE_TEXT,
    ACQUIRING_GPS_TEXT,
    VOICE_PREVIEW_TEXT,
  ];

  clips.push(currentPacePrefix(unit).clip, paceSuffixSegment(unit).clip);
  for (let m = 1; m <= PACE_SEGMENT_MAX_MINUTES; m++) clips.push(paceMinutesSegment(m, unit).clip);
  for (let s = 1; s < 60; s++) clips.push(paceSecondsSegment(s, unit).clip);
  clips.push(...sharedCuePieces(unit).map((p) => p.clip));

  const step = cueDistanceMeters('quarter', unit);
  for (let d = step; d <= DISTANCE_PROGRESS_LIMIT[unit] + 1; d += step) {
    clips.push(distanceProgressPhrase(d, unit));
  }
  return clips;
}

/** Every clip this workout can speak, given the user's cue settings. */
export function enumerateWorkoutClips(workout: WorkoutDefinition, settings: AppSettings): Clip[] {
  const clips = new Map<string, Clip>();
  const add = (phrase: CuePhrase | null) => {
    for (const clip of phrase?.clips ?? []) clips.set(clipKey(clip), clip);
  };
  const intervals = flattenWorkout(workout);
  const progressStep =
    settings.progressCueBasis === 'distance' ? 0 : settings.timeRemainingInterval;
  const auto = settings.progressCueBasis === 'auto';
  const distanceStep = cueDistanceMeters(settings.progressCueDistance, settings.paceUnit);

  intervals.forEach((ci, i) => {
    const ctx = buildCueContext(ci, intervals[i + 1], settings.paceUnit);
    add(intervalStartCue(ctx));

    const timed = !isDistanceInterval(ci) && ci.durationSeconds > 0;
    if (timed) {
      for (const w of settings.countdownWarningSeconds) {
        if (w <= 3) continue;
        add(warningCue({ ...ctx, warningSeconds: w }));
        add(warningSecondsCue(w));
      }
    }

    if (auto && isDistanceInterval(ci) && distanceStep > 0) {
      const goal = ci.distanceMeters ?? 0;
      for (let d = distanceStep; goal - d >= MIN_REMAINING_METERS; d += distanceStep) {
        add(toPhrase([toGoPiece(goal - d, settings.paceUnit)]));
      }
    }

    if (progressStep > 0 && !(auto && isDistanceInterval(ci))) {
      const limit = timed ? ci.durationSeconds : UNTIMED_PROGRESS_LIMIT_SECONDS;
      for (let t = progressStep; t < limit; t += progressStep) {
        add(intervalProgressCue(t));
      }
    }
  });

  return [...clips.values()];
}
