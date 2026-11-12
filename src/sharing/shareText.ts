/**
 * Share message text: workout and result summaries, default captions, and
 * comparisons between a recipient's run and the sender's result.
 */

import {
  WorkoutDefinition,
  WorkoutBlock,
  CompletedWorkout,
  IntervalSplit,
  SharedFrom,
  SharedResult,
  flattenWorkout,
  formatTime,
  defaultSegmentLabel,
} from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import { formatDistance, formatPace, metersPerUnit, paceSuffix } from '../units/format';

export type ShareKind = 'structure' | 'planned' | 'results' | 'challenge';

/** Everything a share is about. */
export interface ShareSubject {
  kind: ShareKind;
  /** Null only for runs whose workout structure is gone. */
  workout: WorkoutDefinition | null;
  workoutName: string;
  /** Results and challenges. */
  run?: CompletedWorkout;
  /** Planned shares: YYYY-MM-DD. */
  plannedDate?: string;
  /** Challenges sent back to the friend who shared the workout. */
  replyTo?: SharedFrom;
}

export interface ShareTextOptions {
  includeResult: boolean;
  includeSplits: boolean;
}

// ── Workouts ─────────────────────────────────────────────────────────

function describeBlock(block: WorkoutBlock, unit: PaceUnit): string {
  if (block.blockType === 'segment') {
    const label = block.label || defaultSegmentLabel(block.segmentType);
    if (block.target.type === 'distance' && block.target.distanceMeters) {
      return `${formatDistance(block.target.distanceMeters, unit)} ${label}`;
    }
    if (block.target.type === 'manual') return label;
    return `${formatTime(block.target.durationSeconds ?? 0)} ${label}`;
  }

  const inner = block.blocks.map((b) => describeBlock(b, unit)).join(' → ');
  return block.repetitions > 1 ? `${block.repetitions}× (${inner})` : inner;
}

/** One line per top-level block, e.g. "4× (3:00 Run → 2:00 Recovery)". */
export function describeWorkoutBlocks(def: WorkoutDefinition, unit: PaceUnit): string[] {
  return def.blocks.map((b) => describeBlock(b, unit));
}

/** "32:00 total · 9 intervals" */
export function formatWorkoutSummary(def: WorkoutDefinition): string {
  const intervals = flattenWorkout(def);
  const totalSecs = intervals.reduce((s, i) => s + i.durationSeconds, 0);
  const parts: string[] = [];
  if (totalSecs > 0) parts.push(`${formatTime(totalSecs)} total`);
  parts.push(`${intervals.length} interval${intervals.length !== 1 ? 's' : ''}`);
  return parts.join(' · ');
}

/** Format a YYYY-MM-DD calendar date as e.g. "Thursday, Nov 14". */
export function formatPlannedDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

// ── Results ──────────────────────────────────────────────────────────

/** The shareable result of a finished run. */
export function resultOf(run: Pick<CompletedWorkout, 'totalDurationMs' | 'totalDistanceMeters'>): SharedResult {
  return {
    durationMs: run.totalDurationMs,
    ...(run.totalDistanceMeters && run.totalDistanceMeters > 0
      ? { distanceMeters: run.totalDistanceMeters }
      : {}),
  };
}

/** Average pace in min/mile, or null when there's too little distance to trust. */
export function resultPaceMinPerMile(result: SharedResult): number | null {
  const meters = result.distanceMeters;
  if (meters == null || meters < 100 || result.durationMs <= 0) return null;
  const pace = result.durationMs / 60000 / (meters / metersPerUnit('minPerMile'));
  return isFinite(pace) && pace > 0 && pace < 30 ? pace : null;
}

/** "32:10 · 4.02 mi · 8:00/mi", or null for an empty result. */
export function formatResultMark(result: SharedResult, unit: PaceUnit): string | null {
  if (result.durationMs <= 0) return null;

  const parts = [formatTime(Math.floor(result.durationMs / 1000))];
  if (result.distanceMeters != null && result.distanceMeters > 0) {
    parts.push(formatDistance(result.distanceMeters, unit));
  }
  const pace = resultPaceMinPerMile(result);
  if (pace != null) parts.push(formatPace(pace, unit));

  return parts.join(' · ');
}

/** Split lines, e.g. " 1. Run        3:02  7:45/mi". */
export function formatSplitsText(splits: IntervalSplit[], unit: PaceUnit): string {
  const lines = ['Splits:'];
  splits.forEach((s, i) => {
    let line = ` ${String(i + 1).padStart(2)}. ${s.label.padEnd(10)} ${formatTime(Math.floor(s.actualDurationMs / 1000))}`;
    if (s.avgPaceMinPerMile != null && isFinite(s.avgPaceMinPerMile)) {
      line += `  ${formatPace(s.avgPaceMinPerMile, unit)}`;
    }
    lines.push(line);
  });
  return lines.join('\n');
}

// ── Comparison ───────────────────────────────────────────────────────

export interface ResultComparison {
  /** Pace when both runs have enough distance, otherwise total time. */
  basis: 'pace' | 'time';
  /** Positive when `mine` was better. Seconds, or seconds per unit for pace. */
  deltaSeconds: number;
  /** "0:12/mi faster", "0:32 slower", or "dead even". */
  label: string;
}

/** How a recipient's run compares with the sender's result. */
export function compareResults(
  mine: SharedResult,
  theirs: SharedResult,
  unit: PaceUnit,
): ResultComparison | null {
  if (mine.durationMs <= 0 || theirs.durationMs <= 0) return null;

  const myPace = resultPaceMinPerMile(mine);
  const theirPace = resultPaceMinPerMile(theirs);
  let basis: ResultComparison['basis'];
  let deltaSeconds: number;
  if (myPace != null && theirPace != null) {
    basis = 'pace';
    const perUnit = metersPerUnit(unit) / metersPerUnit('minPerMile');
    deltaSeconds = Math.round((theirPace - myPace) * perUnit * 60);
  } else {
    basis = 'time';
    deltaSeconds = Math.round((theirs.durationMs - mine.durationMs) / 1000);
  }

  if (deltaSeconds === 0) return { basis, deltaSeconds, label: 'dead even' };
  const amount = formatTime(Math.abs(deltaSeconds)) + (basis === 'pace' ? paceSuffix(unit) : '');
  return { basis, deltaSeconds, label: `${amount} ${deltaSeconds > 0 ? 'faster' : 'slower'}` };
}

// ── Captions & messages ──────────────────────────────────────────────

function sharedResultOf(subject: ShareSubject, options: ShareTextOptions): SharedResult | null {
  if (!options.includeResult || !subject.run) return null;
  const result = resultOf(subject.run);
  return result.durationMs > 0 ? result : null;
}

/** The editable first line of a share message. */
export function defaultCaption(subject: ShareSubject, options: ShareTextOptions, unit: PaceUnit): string {
  const name = `"${subject.workoutName}"`;
  const result = sharedResultOf(subject, options);
  const mark = result ? formatResultMark(result, unit) : null;

  switch (subject.kind) {
    case 'structure':
      return `Try ${name} with me on SplitCue.`;
    case 'planned':
      return subject.plannedDate
        ? `Run ${name} with me on ${formatPlannedDate(subject.plannedDate)}.`
        : `Run ${name} with me.`;
    case 'results':
      return mark ? `Just finished ${name}: ${mark}.` : `Just finished ${name}.`;
    case 'challenge': {
      const theirs = subject.replyTo?.result;
      if (subject.replyTo) {
        const comparison = result && theirs ? compareResults(result, theirs, unit) : null;
        if (!mark) return `Took on your ${name} challenge. Your move.`;
        if (!comparison || comparison.deltaSeconds === 0) {
          return `Took on your ${name} challenge: ${mark}. Dead even with you!`;
        }
        return comparison.deltaSeconds > 0
          ? `Took on your ${name} challenge: ${mark}. That's ${comparison.label} than you. Your move.`
          : `Took on your ${name} challenge: ${mark}. You win this round, I was ${comparison.label}. Rematch?`;
      }
      return mark
        ? `I ran ${name}: ${mark}. Think you can beat it?`
        : `Come run ${name} with me. See who runs it better.`;
    }
  }
}

/** The message after the caption: workout structure, plus splits when included. */
export function composeShareBody(subject: ShareSubject, options: ShareTextOptions, unit: PaceUnit): string {
  const sections: string[] = [];
  if (subject.workout && subject.workout.blocks.length > 0) {
    sections.push([formatWorkoutSummary(subject.workout), ...describeWorkoutBlocks(subject.workout, unit)].join('\n'));
  }
  const splits = subject.run?.splits;
  if (options.includeResult && options.includeSplits && splits && splits.length > 0) {
    sections.push(formatSplitsText(splits, unit));
  }
  return sections.join('\n\n');
}

/** Full message text. The link is appended separately, per platform. */
export function composeShareMessage(caption: string, body: string): string {
  return [caption.trim(), body].filter(Boolean).join('\n\n');
}
