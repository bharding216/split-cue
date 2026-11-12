/**
 * Workout share links: payloads, short codes, and decoding.
 *
 * Share kinds (see ShareKind):
 *  - structure: a workout to try (Home, editor)
 *  - planned:   a workout plus its calendar date, so the recipient can add it
 *               to the same day
 *  - results:   a finished run
 *  - challenge: a finished run framed as a result to beat; replies to a
 *               friend's challenge use this kind too
 *
 * Share links are HTTPS URLs (splitcue.app/w/<code>) served by the share-proxy
 * worker and the `share` Edge Function, which renders a landing page that
 * opens the app or sends the recipient to the store.
 *
 * Falls back to a legacy `pacecue://` deep link with base64-encoded data
 * if the Supabase insert fails.
 */

import Constants from 'expo-constants';
import {
  WorkoutDefinition,
  WorkoutBlock,
  SharedResult,
  generateId,
} from '../workout/workoutTypes';
import { migrateToBlockModel } from '../workout/workoutStorage';
import { supabase } from '../analytics/supabaseClient';
import type { ShareKind } from './shareText';

export { formatPlannedDate } from './shareText';
export type { ShareKind } from './shareText';

function getScheme(): string {
  const variant = Constants.expoConfig?.extra?.appVariant as string | undefined;
  if (variant === 'development') return 'pacecue-dev';
  if (variant === 'preview') return 'pacecue-preview';
  return 'pacecue';
}

// ── Payload ──────────────────────────────────────────────────────────

/**
 * Compact share format. Fields after `b` are optional; builds that predate
 * them ignore unknown keys and import a plain workout.
 */
interface ShareableWorkoutV2 {
  v: 2;
  n: string;
  b: WorkoutBlock[];
  /** Sender's app variant, set only by dev/preview builds. The landing page
   *  uses it to deep link into the matching build. */
  a?: 'development' | 'preview';
  /** Calendar date (YYYY-MM-DD) the sender planned the workout for. */
  pd?: string;
  k?: ShareKind;
  /** Sender's first name, only when they chose to show it. */
  s?: string;
  /** Sender's result, only when they chose to show it: duration (ms) and distance (m). */
  r?: { d: number; m?: number };
}

export interface ShareLinkOptions {
  kind: ShareKind;
  plannedDate?: string;
  senderName?: string;
  result?: SharedResult;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const SENDER_NAME_MAX_LENGTH = 30;

function buildPayload(def: WorkoutDefinition, options: ShareLinkOptions): ShareableWorkoutV2 {
  const variant = Constants.expoConfig?.extra?.appVariant as string | undefined;
  const name = options.senderName?.trim().slice(0, SENDER_NAME_MAX_LENGTH);
  const result = options.result;
  return {
    v: 2,
    n: def.name,
    b: def.blocks,
    k: options.kind,
    ...(variant === 'development' || variant === 'preview' ? { a: variant } : {}),
    ...(options.plannedDate ? { pd: options.plannedDate } : {}),
    ...(name ? { s: name } : {}),
    ...(result && result.durationMs > 0
      ? {
          r: {
            d: Math.round(result.durationMs),
            ...(result.distanceMeters ? { m: Math.round(result.distanceMeters) } : {}),
          },
        }
      : {}),
  };
}

/**
 * Encode a workout into a legacy deep link URL, used when the short link
 * can't be stored.
 */
export function encodeWorkoutLink(def: WorkoutDefinition, options: ShareLinkOptions): string {
  const { a: _variant, ...shareable } = buildPayload(def, options);
  // UTF-8 first: btoa only accepts Latin-1, and names can contain emoji.
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(shareable))));
  return `${getScheme()}://workout/import?d=${encodeURIComponent(base64)}`;
}

export interface SharedWorkout {
  workout: WorkoutDefinition;
  /** YYYY-MM-DD when shared from a planned calendar day, otherwise null. */
  plannedDate: string | null;
  kind: ShareKind | null;
}

/**
 * Result of decoding a shared workout. `'needs-update'` means the payload was
 * written by a newer app version with a format this build doesn't understand.
 */
export type SharedWorkoutResult = SharedWorkout | 'needs-update' | null;

/**
 * Decode a legacy deep link URL back into a WorkoutDefinition.
 */
export function decodeWorkoutLink(url: string): SharedWorkoutResult {
  try {
    const match = url.match(/[?&]d=([^&]+)/);
    if (!match) return null;

    const binary = atob(decodeURIComponent(match[1]));
    let json: string;
    try {
      json = decodeURIComponent(escape(binary));
    } catch {
      // Older links encoded the JSON as Latin-1.
      json = binary;
    }
    return decodeSharePayload(JSON.parse(json), null);
  } catch {
    return null;
  }
}

const SHARE_KINDS: readonly ShareKind[] = ['structure', 'planned', 'results', 'challenge'];

function parseSenderName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().slice(0, SENDER_NAME_MAX_LENGTH);
  return name || undefined;
}

function parseResult(value: any): SharedResult | undefined {
  const d = value?.d;
  if (typeof d !== 'number' || !isFinite(d) || d <= 0) return undefined;
  const m = value?.m;
  return {
    durationMs: d,
    ...(typeof m === 'number' && isFinite(m) && m > 0 ? { distanceMeters: m } : {}),
  };
}

/** Decode a share payload (v1 or v2) into a workout with its sender context. */
function decodeSharePayload(parsed: any, code: string | null): SharedWorkoutResult {
  if (!parsed || typeof parsed !== 'object') return null;

  // v1 payloads have no `v`; any version other than 2 comes from a newer app.
  if (parsed.v !== undefined && parsed.v !== 2) return 'needs-update';

  if (parsed.v === 2 && parsed.n && Array.isArray(parsed.b)) {
    const now = Date.now();
    const senderName = parseSenderName(parsed.s);
    const result = parseResult(parsed.r);
    const hasSender = !!(code || senderName || result);
    return {
      workout: {
        id: generateId(),
        name: parsed.n,
        blocks: parsed.b,
        ...(hasSender
          ? {
              sharedFrom: {
                ...(code ? { code } : {}),
                ...(senderName ? { senderName } : {}),
                ...(result ? { result } : {}),
              },
            }
          : {}),
        createdAt: now,
        updatedAt: now,
      },
      plannedDate: typeof parsed.pd === 'string' && DATE_KEY_PATTERN.test(parsed.pd) ? parsed.pd : null,
      kind: SHARE_KINDS.includes(parsed.k) ? parsed.k : null,
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
    return { workout: migrateToBlockModel(oldDef), plannedDate: null, kind: null };
  }

  return null;
}

// ── Short Link (Supabase) ────────────────────────────────────────────

const SHARE_BASE_URL = 'https://splitcue.app/w';
const SHORT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateShortCode(): string {
  let code = '';
  for (let i = 0; i < 7; i++) {
    code += SHORT_CODE_CHARS.charAt(Math.floor(Math.random() * SHORT_CODE_CHARS.length));
  }
  return code;
}

/** Extract the short code from a share URL (splitcue.app/w/<code> or <scheme>://w/<code>). */
export function parseShareCode(url: string): string | null {
  const match = url.match(/\/w\/([A-Za-z0-9]{4,16})\/?(?:[?#].*)?$/);
  return match ? match[1] : null;
}

export function shareUrlForCode(code: string): string {
  return `${SHARE_BASE_URL}/${code}`;
}

export interface CreatedShareLink {
  url: string;
  /** Null when the insert failed and `url` is a legacy deep link. */
  code: string | null;
}

/**
 * Store a share and return its short link. Pass the `code` and `imagePath`
 * of a share card already uploaded under that code.
 */
export async function createShareLink(
  def: WorkoutDefinition,
  options: ShareLinkOptions,
  { code = generateShortCode(), imagePath }: { code?: string; imagePath?: string | null } = {},
): Promise<CreatedShareLink> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const row: Record<string, unknown> = {
      code,
      workout_data: buildPayload(def, options),
      user_id: session?.user?.id ?? null,
      workout_id: def.id,
      workout_name: def.name,
      share_type: options.kind,
    };
    let { error } = await supabase
      .from('shared_workouts')
      .insert(imagePath ? { ...row, image_path: imagePath } : row);
    // Still create the link if the image column isn't migrated yet.
    if (error && imagePath) {
      ({ error } = await supabase.from('shared_workouts').insert(row));
    }
    if (!error) {
      return { url: shareUrlForCode(code), code };
    }
  } catch {
    // Network failure — fall through to legacy link
  }

  return { url: encodeWorkoutLink(def, options), code: null };
}

export async function resolveShareCode(code: string): Promise<SharedWorkoutResult> {
  try {
    const { data, error } = await supabase
      .from('shared_workouts')
      .select('workout_data')
      .eq('code', code)
      .single();

    if (error || !data) return null;
    return decodeSharePayload(data.workout_data, code);
  } catch {
    return null;
  }
}

export type ShareEventKind = 'import' | 'complete';

/** Count an import or completion against a share link. Never throws. */
export function recordShareEvent(code: string | undefined | null, kind: ShareEventKind): void {
  if (!code) return;
  Promise.resolve(supabase.rpc('record_share_event', { share_code: code, event_kind: kind })).catch(() => {});
}
