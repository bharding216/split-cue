/**
 * Strict JSON schemas, validation, and normalization for AI-generated
 * workouts in the block model (Segment | RepeatGroup).
 *
 * Pure TypeScript with no Deno APIs so scripts/ai-evals can reuse it.
 */

// ── Schema ───────────────────────────────────────────────────

const SEGMENT_TYPES = ["warmup", "run", "recovery", "rest", "cooldown"];
const INTENSITIES = ["recovery", "easy", "moderate", "tempo", "hard", "sprint"];
export const WORKOUT_CATEGORIES = ["easy", "tempo", "intervals", "long_run", "race", "other"];

/** Labels are shown on the run screen and spoken by voice cues, so they must stay short. */
export const MAX_LABEL_LENGTH = 30;
const SHORT_LABEL_DESCRIPTION =
  "Short display name, 1–4 words, e.g. 'Warm Up', '800m Repeat', 'Recovery Jog'. No pacing advice or sentences.";

/** `$defs` for the block model. Include in any schema that references `#/$defs/workout`. */
export const WORKOUT_DEFS = {
  segment: {
    type: "object",
    additionalProperties: false,
    required: ["blockType", "segmentType", "label", "target", "intensity", "targetPace"],
    properties: {
      blockType: { type: "string", enum: ["segment"] },
      segmentType: { type: "string", enum: SEGMENT_TYPES },
      label: { type: ["string", "null"], description: SHORT_LABEL_DESCRIPTION },
      target: {
        type: "object",
        additionalProperties: false,
        required: ["type", "durationSeconds", "distanceMeters"],
        properties: {
          type: { type: "string", enum: ["time", "distance"] },
          durationSeconds: { type: ["number", "null"], description: "Seconds, when type is time; otherwise null." },
          distanceMeters: { type: ["number", "null"], description: "Meters, when type is distance; otherwise null." },
        },
      },
      intensity: { type: ["string", "null"], enum: [...INTENSITIES, null] },
      targetPace: { type: ["number", "null"], description: "Decimal min/mile, e.g. 8.5 = 8:30/mi." },
    },
  },
  repeat: {
    type: "object",
    additionalProperties: false,
    required: ["blockType", "repetitions", "name", "blocks"],
    properties: {
      blockType: { type: "string", enum: ["repeat"] },
      repetitions: { type: "integer" },
      name: { type: ["string", "null"], description: SHORT_LABEL_DESCRIPTION },
      blocks: { type: "array", items: { $ref: "#/$defs/block" } },
    },
  },
  block: { anyOf: [{ $ref: "#/$defs/segment" }, { $ref: "#/$defs/repeat" }] },
  workout: {
    type: "object",
    additionalProperties: false,
    required: ["name", "category", "blocks", "targetDistanceMeters"],
    properties: {
      name: { type: "string" },
      category: { type: "string", enum: WORKOUT_CATEGORIES },
      blocks: { type: "array", items: { $ref: "#/$defs/block" } },
      targetDistanceMeters: { type: ["number", "null"] },
    },
  },
};

// ── Types ────────────────────────────────────────────────────

export interface AISegment {
  blockType: "segment";
  segmentType: string;
  label?: string | null;
  target: { type: "time" | "distance"; durationSeconds?: number | null; distanceMeters?: number | null };
  intensity?: string | null;
  targetPace?: number | null;
}

export interface AIRepeat {
  blockType: "repeat";
  repetitions: number;
  name?: string | null;
  blocks: AIBlock[];
}

export type AIBlock = AISegment | AIRepeat;

export interface AIWorkout {
  name: string;
  category: string;
  blocks: AIBlock[];
  targetDistanceMeters?: number | null;
}

export interface PaceContext {
  easyPace?: number | null;
  fastPace?: number | null;
}

// ── Validation ───────────────────────────────────────────────

const METERS_PER_MILE = 1609.344;
const FALLBACK_PACE = 10; // min/mile, only used to estimate duration

/** Rough total duration in seconds, estimating distance segments from pace. */
export function estimateWorkoutSeconds(blocks: AIBlock[], ctx: PaceContext): number {
  let total = 0;
  for (const block of blocks) {
    if (block.blockType === "repeat") {
      total += Math.max(1, block.repetitions) * estimateWorkoutSeconds(block.blocks ?? [], ctx);
      continue;
    }
    if (block.target.type === "time") {
      total += block.target.durationSeconds ?? 0;
    } else {
      const pace = block.targetPace ?? ctx.easyPace ?? FALLBACK_PACE;
      total += ((block.target.distanceMeters ?? 0) / METERS_PER_MILE) * pace * 60;
    }
  }
  return total;
}

/** Problems in a workout, phrased as instructions the model can act on. */
export function validateWorkout(workout: AIWorkout, ctx: PaceContext, where = "workout"): string[] {
  const problems: string[] = [];
  if (!workout || !Array.isArray(workout.blocks) || workout.blocks.length === 0) {
    return [`${where}: blocks must contain at least one block.`];
  }

  validateBlocks(workout.blocks, ctx, where, problems);

  // Warmups belong at the start and cooldowns at the end, as top-level segments.
  const top = workout.blocks;
  const firstMain = top.findIndex((b) => !(b.blockType === "segment" && b.segmentType === "warmup"));
  if (firstMain >= 0 && top.slice(firstMain).some((b) => b.blockType === "segment" && b.segmentType === "warmup")) {
    problems.push(`${where}: warmup segments must all come first.`);
  }
  let lastMain = -1;
  top.forEach((b, i) => {
    if (!(b.blockType === "segment" && b.segmentType === "cooldown")) lastMain = i;
  });
  if (top.slice(0, lastMain + 1).some((b) => b.blockType === "segment" && b.segmentType === "cooldown")) {
    problems.push(`${where}: cooldown segments must all come last.`);
  }

  const minutes = estimateWorkoutSeconds(top, ctx) / 60;
  if (minutes < 5) {
    problems.push(`${where}: total length is about ${minutes.toFixed(1)} min, which is too short. durationSeconds is in SECONDS (30 min = 1800).`);
  } else if (minutes > 300) {
    problems.push(`${where}: total length is about ${Math.round(minutes)} min, which is unrealistically long. Check durationSeconds (seconds) and distanceMeters (meters).`);
  }

  return problems;
}

function validateBlocks(blocks: AIBlock[], ctx: PaceContext, where: string, problems: string[]): void {
  blocks.forEach((block, i) => {
    const at = `${where} block ${i + 1}`;
    const label = block.blockType === "repeat" ? block.name : block.label;
    if (label && label.length > MAX_LABEL_LENGTH) {
      problems.push(`${at}: "${label}" is too long; use a 1–4 word label like "Warm Up" or "800m Repeat".`);
    }
    if (block.blockType === "repeat") {
      if (!Number.isInteger(block.repetitions) || block.repetitions < 1 || block.repetitions > 50) {
        problems.push(`${at}: repetitions must be a whole number between 1 and 50.`);
      }
      if (!Array.isArray(block.blocks) || block.blocks.length === 0) {
        problems.push(`${at}: repeat group must contain at least one block.`);
      } else {
        validateBlocks(block.blocks, ctx, `${at}`, problems);
      }
      return;
    }

    const t = block.target;
    if (t.type === "time" && !(Number(t.durationSeconds) > 0)) {
      problems.push(`${at}: time target needs durationSeconds > 0.`);
    }
    if (t.type === "distance" && !(Number(t.distanceMeters) > 0)) {
      problems.push(`${at}: distance target needs distanceMeters > 0.`);
    }

    const pace = block.targetPace;
    if (pace != null) {
      if (!(pace >= 3 && pace <= 25)) {
        problems.push(`${at}: targetPace ${pace} is not a realistic min/mile value.`);
      } else if (ctx.fastPace && pace < ctx.fastPace - 1) {
        problems.push(`${at}: targetPace ${formatPace(pace)} is far faster than the runner's fast pace (${formatPace(ctx.fastPace)}).`);
      }
    }
  });
}

/** Easy/recovery days should be one simple easy effort, not a structured session. */
export function validateEasyDay(workout: AIWorkout, dayLabel: string, where: string): string[] {
  if (!/\b(easy|recovery)\b/i.test(dayLabel)) return [];
  const hasRepeats = workout.blocks?.some((b) => b.blockType === "repeat");
  const hard = flattenSegments(workout.blocks ?? []).some(
    (s) => s.intensity === "hard" || s.intensity === "sprint" || s.intensity === "tempo",
  );
  return hasRepeats || hard
    ? [`${where}: "${dayLabel}" must be a simple easy run with no repeats or hard/tempo segments.`]
    : [];
}

function flattenSegments(blocks: AIBlock[]): AISegment[] {
  return blocks.flatMap((b) => (b.blockType === "repeat" ? flattenSegments(b.blocks ?? []) : [b]));
}

export function formatPace(pace: number): string {
  const total = Math.round(pace * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/mi`;
}

// ── Normalization ────────────────────────────────────────────

/** Drop nulls and enforce invariants the app relies on (one target field, intensity XOR targetPace). */
export function normalizeWorkout(workout: AIWorkout): AIWorkout {
  const out: AIWorkout = {
    name: workout.name,
    category: workout.category,
    blocks: (workout.blocks ?? []).map(normalizeBlock),
  };
  if (workout.targetDistanceMeters != null && workout.targetDistanceMeters > 0) {
    out.targetDistanceMeters = workout.targetDistanceMeters;
  }
  return out;
}

function normalizeBlock(block: AIBlock): AIBlock {
  if (block.blockType === "repeat") {
    const rg: AIRepeat = {
      blockType: "repeat",
      repetitions: Math.max(1, Math.round(block.repetitions)),
      blocks: (block.blocks ?? []).map(normalizeBlock),
    };
    if (block.name && block.name.length <= MAX_LABEL_LENGTH) rg.name = block.name;
    return rg;
  }

  const target = block.target.type === "time"
    ? { type: "time" as const, durationSeconds: block.target.durationSeconds ?? 0 }
    : { type: "distance" as const, distanceMeters: block.target.distanceMeters ?? 0 };
  const seg: AISegment = { blockType: "segment", segmentType: block.segmentType, target };
  if (block.label && block.label.length <= MAX_LABEL_LENGTH) seg.label = block.label;
  if (block.intensity) seg.intensity = block.intensity;
  else if (block.targetPace != null) seg.targetPace = block.targetPace;
  return seg;
}
