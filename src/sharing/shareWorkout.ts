/**
 * Workout sharing utilities.
 *
 * Supports three sharing modes:
 *  1. Share workout structure (from Home) — text summary + deep link
 *  2. Share workout results (from History) — text summary with splits + deep link
 *  3. Challenge a friend (after a workout) — the structure plus the result to beat
 *
 * Share links are HTTPS URLs pointing to a Supabase Edge Function that
 * serves a landing page. The page lets recipients open the workout in the
 * app (via deep link) or download from the App Store / Play Store.
 *
 * Falls back to a legacy `pacecue://` deep link with base64-encoded data
 * if the Supabase upload fails.
 */

import { Share, Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  WorkoutDefinition,
  WorkoutBlock,
  Segment,
  RepeatGroup,
  CompletedWorkout,
  IntervalSplit,
  flattenWorkout,
  formatTime,
  generateId,
  defaultSegmentLabel,
} from '../workout/workoutTypes';
import { loadSettings, migrateToBlockModel } from '../workout/workoutStorage';
import { track } from '../analytics/track';
import { supabase } from '../analytics/supabaseClient';
import { formatDistance as formatUnitDistance } from '../pace/paceTracker';
import type { PaceUnit } from '../pace/paceTypes';
import { formatDistance, formatPace as formatUnitPace, metersPerUnit, paceSuffix } from '../units/format';

// ── Helpers ──────────────────────────────────────────────────────────

async function loadPaceUnit(): Promise<PaceUnit> {
  try {
    return (await loadSettings()).paceUnit;
  } catch {
    return 'minPerMile';
  }
}

function getScheme(): string {
  const variant = Constants.expoConfig?.extra?.appVariant as string | undefined;
  if (variant === 'development') return 'pacecue-dev';
  if (variant === 'preview') return 'pacecue-preview';
  return 'pacecue';
}

function formatPace(paceMinutes: number | null | undefined): string {
  if (paceMinutes == null || !isFinite(paceMinutes)) return '--:--';
  const mins = Math.floor(paceMinutes);
  const secs = Math.round((paceMinutes - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function fmtDur(seconds: number): string {
  return formatTime(seconds);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Text Formatting ──────────────────────────────────────────────────

/** Describe a single workout block for text sharing. */
function describeBlock(block: WorkoutBlock, unit: PaceUnit): string {
  if (block.blockType === 'segment') {
    const label = block.label || defaultSegmentLabel(block.segmentType);
    if (block.target.type === 'distance' && block.target.distanceMeters) {
      return `${formatDistance(block.target.distanceMeters, unit)} ${label}`;
    }
    return `${fmtDur(block.target.durationSeconds ?? 0)} ${label}`;
  }

  // RepeatGroup
  const inner = block.blocks.map((b) => describeBlock(b, unit)).join(' → ');
  if (block.repetitions > 1) {
    return `${block.repetitions}× (${inner})`;
  }
  return inner;
}

/**
 * Generate a human-readable text summary of a workout definition.
 */
export function formatWorkoutText(def: WorkoutDefinition, unit: PaceUnit = 'minPerMile'): string {
  const intervals = flattenWorkout(def);
  const totalSecs = intervals.reduce((s, i) => s + i.durationSeconds, 0);

  const lines: string[] = [
    `${def.name} — SplitCue Workout`,
    '',
    `${fmtDur(totalSecs)} total · ${intervals.length} interval${intervals.length !== 1 ? 's' : ''}`,
    '',
  ];

  for (const block of def.blocks) {
    lines.push(describeBlock(block, unit));
  }

  return lines.join('\n');
}

/**
 * Generate a text summary of completed workout results.
 */
export function formatResultsText(
  completed: CompletedWorkout,
  splits?: IntervalSplit[],
  unit: PaceUnit = 'minPerMile',
): string {
  const date = new Date(completed.completedAt);
  const dateStr = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const totalSec = Math.floor(completed.totalDurationMs / 1000);

  const lines: string[] = [
    `Results — ${dateStr}`,
    '',
  ];

  const summaryParts = [`${fmtDur(totalSec)} total`];
  if (completed.totalDistanceMeters && completed.totalDistanceMeters > 0) {
    summaryParts.push(formatDistance(completed.totalDistanceMeters, unit));
  }
  lines.push(summaryParts.join(' · '));

  const useSplits = splits ?? completed.splits;
  if (useSplits && useSplits.length > 0) {
    lines.push('');
    lines.push('Splits:');
    for (let i = 0; i < useSplits.length; i++) {
      const s = useSplits[i];
      const actualSec = Math.floor(s.actualDurationMs / 1000);
      const label = s.label.padEnd(10);
      let line = ` ${String(i + 1).padStart(2)}. ${label} ${fmtDur(actualSec)}`;
      if (s.avgPaceMinPerMile != null && isFinite(s.avgPaceMinPerMile)) {
        line += `  ${formatUnitPace(s.avgPaceMinPerMile, unit)}`;
      }
      lines.push(line);
    }
  }

  return lines.join('\n');
}

// ── Deep Link Encoding ───────────────────────────────────────────────

/**
 * New compact share format: just name + blocks.
 */
interface ShareableWorkoutV2 {
  v: 2;
  n: string;
  b: WorkoutBlock[];
  /** Sender's app variant, set only by dev/preview builds. The landing page
   *  uses it to deep link into the matching build. */
  a?: 'development' | 'preview';
}

/**
 * Encode a workout definition into a deep link URL.
 */
export function encodeWorkoutLink(def: WorkoutDefinition): string {
  const shareable: ShareableWorkoutV2 = {
    v: 2,
    n: def.name,
    b: def.blocks,
  };

  const json = JSON.stringify(shareable);
  const base64 = btoa(json);
  const scheme = getScheme();
  return `${scheme}://workout/import?d=${encodeURIComponent(base64)}`;
}

/**
 * Decode a deep link URL back into a WorkoutDefinition.
 * Handles both old v1 format ({ n, w, b, c }) and new v2 format ({ v:2, n, b }).
 */
export function decodeWorkoutLink(url: string): WorkoutDefinition | null {
  try {
    const match = url.match(/[?&]d=([^&]+)/);
    if (!match) return null;

    const base64 = decodeURIComponent(match[1]);
    const json = atob(base64);
    const parsed = JSON.parse(json);

    return decodeSharePayload(parsed);
  } catch {
    return null;
  }
}

/** Decode a share payload (either v1 or v2) into a WorkoutDefinition. */
function decodeSharePayload(parsed: any): WorkoutDefinition | null {
  if (!parsed || typeof parsed !== 'object') return null;

  // New v2 format
  if (parsed.v === 2 && parsed.n && Array.isArray(parsed.b)) {
    const now = Date.now();
    return {
      id: generateId(),
      name: parsed.n,
      blocks: parsed.b,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Old v1 format: { n, w, b, c } — migrate through block model
  if (parsed.n && Array.isArray(parsed.b)) {
    const oldDef = {
      id: generateId(),
      name: parsed.n,
      warmup: parsed.w ?? [],
      blocks: parsed.b,
      cooldown: parsed.c ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    return migrateToBlockModel(oldDef);
  }

  return null;
}

// ── Short Link (Supabase) ────────────────────────────────────────────

const SHARE_BASE_URL = 'https://splitcue.app/w';
const SHORT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateShortCode(): string {
  let code = '';
  for (let i = 0; i < 7; i++) {
    code += SHORT_CODE_CHARS.charAt(Math.floor(Math.random() * SHORT_CODE_CHARS.length));
  }
  return code;
}

export async function createShareLink(
  def: WorkoutDefinition,
  shareType: 'structure' | 'results' | 'challenge' = 'structure',
): Promise<string> {
  const variant = Constants.expoConfig?.extra?.appVariant as string | undefined;
  const shareable: ShareableWorkoutV2 = {
    v: 2,
    n: def.name,
    b: def.blocks,
    ...(variant === 'development' || variant === 'preview' ? { a: variant } : {}),
  };

  const code = generateShortCode();

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;

  try {
    const { error } = await supabase
      .from('shared_workouts')
      .insert({
        code,
        workout_data: shareable,
        user_id: userId,
        workout_id: def.id,
        workout_name: def.name,
        share_type: shareType,
      });

    if (!error) {
      return `${SHARE_BASE_URL}/${code}`;
    }
  } catch {
    // Network failure — fall through to legacy link
  }

  return encodeWorkoutLink(def);
}

export async function resolveShareCode(code: string): Promise<WorkoutDefinition | null> {
  try {
    const { data, error } = await supabase
      .from('shared_workouts')
      .select('workout_data')
      .eq('code', code)
      .single();

    if (error || !data) return null;

    const parsed = data.workout_data;
    return decodeSharePayload(parsed);
  } catch {
    return null;
  }
}

// ── Share Actions ────────────────────────────────────────────────────

export async function shareWorkoutStructure(
  def: WorkoutDefinition,
): Promise<void> {
  const text = formatWorkoutText(def, await loadPaceUnit());
  const link = await createShareLink(def, 'structure');

  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { message: `${text}\n\nTry it in SplitCue:`, url: link }
        : { message: `${text}\n\nTry it in SplitCue:\n${link}`, title: `${def.name} — SplitCue Workout` },
    );
    track('workout_shared', {
      workout_id: def.id,
      workout_name: def.name,
      share_type: 'structure',
    });
  } catch {
    // User cancelled or share failed
  }
}

export async function shareWorkoutResults(
  def: WorkoutDefinition | null,
  completed: CompletedWorkout,
): Promise<void> {
  const parts: string[] = [];
  const unit = await loadPaceUnit();

  if (def) {
    parts.push(formatWorkoutText(def, unit));
    parts.push('');
  }

  parts.push(formatResultsText(completed, undefined, unit));

  let link: string | undefined;
  if (def) {
    link = await createShareLink(def, 'results');
  }

  const textBody = parts.join('\n');
  const iosMessage = link ? `${textBody}\n\nTry it in SplitCue:` : textBody;
  const androidMessage = link ? `${textBody}\n\nTry it in SplitCue:\n${link}` : textBody;

  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { message: iosMessage, ...(link ? { url: link } : {}) }
        : { message: androidMessage, title: `${completed.workoutName} Results — SplitCue` },
    );
    track('workout_shared', {
      workout_id: completed.workoutId,
      workout_name: completed.workoutName,
      share_type: 'results',
      has_definition: !!def,
    });
  } catch {
    // User cancelled or share failed
  }
}

export interface ChallengeResult {
  totalDurationMs: number;
  totalDistanceMeters?: number;
  paceUnit?: PaceUnit;
}

export function formatChallengeMark(result: ChallengeResult): string | null {
  if (result.totalDurationMs <= 0) return null;

  const unit = result.paceUnit ?? 'minPerMile';
  const parts = [fmtDur(Math.floor(result.totalDurationMs / 1000))];

  const meters = result.totalDistanceMeters;
  if (meters != null && meters > 0) {
    parts.push(formatUnitDistance(meters, unit));

    if (meters >= 100) {
      const minutes = result.totalDurationMs / 60000;
      const pace = minutes / (meters / metersPerUnit(unit));
      if (isFinite(pace) && pace > 0 && pace < 30) {
        parts.push(`${formatPace(pace)}${paceSuffix(unit)}`);
      }
    }
  }

  return parts.join(' · ');
}

export async function shareWorkoutChallenge(
  def: WorkoutDefinition,
  result?: ChallengeResult,
): Promise<boolean> {
  const lines: string[] = [
    'Come run this with me.',
    '',
    `I just finished "${def.name}" on SplitCue.`,
  ];

  const mark = result ? formatChallengeMark(result) : null;
  if (mark) lines.push(mark);

  lines.push('');
  lines.push('Here\'s the workout if you want to give it a shot.');
  lines.push('');
  lines.push(formatWorkoutText(def, result?.paceUnit ?? (await loadPaceUnit())));

  const link = await createShareLink(def, 'challenge');
  const textBody = lines.join('\n');

  try {
    const shareResult = await Share.share(
      Platform.OS === 'ios'
        ? { message: `${textBody}\n\nOpen it in SplitCue:`, url: link }
        : {
            message: `${textBody}\n\nOpen it in SplitCue:\n${link}`,
            title: `${def.name} — SplitCue`,
          },
    );

    const shared = shareResult.action === Share.sharedAction;
    if (shared) {
      track('workout_shared', {
        workout_id: def.id,
        workout_name: def.name,
        share_type: 'challenge',
      });
    }
    return shared;
  } catch {
    return false;
  }
}
