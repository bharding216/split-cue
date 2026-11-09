/**
 * adjust-plan — Supabase Edge Function
 *
 * Handles conversational adjustments to an existing training plan.
 * Receives the current plan summary, user's adjustment request, and
 * conversation history. Returns specific workout modifications.
 *
 * Deploy:  supabase functions deploy adjust-plan
 * Secrets: supabase secrets set OPENAI_API_KEY=sk-...
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { chatJson, MODELS, stripNulls, type ChatMessage } from "../_shared/openai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Types ────────────────────────────────────────────────────

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface PlanSummaryWorkout {
  date: string;
  day_label: string;
  status: string;
  week_number: number;
}

interface RequestBody {
  prompt: string;
  plan_summary: {
    title: string;
    race_type: string;
    race_date: string;
    goal_type?: 'race' | 'pace_target';
    goal_pace?: number | null;
    start_date: string;
    days_per_week: number;
    total_weeks: number;
    workouts: PlanSummaryWorkout[];
  };
  profile?: {
    experience_level?: string;
    typical_run_minutes?: number;
    easy_pace?: number;
    fast_pace?: number;
  };
  conversation?: ConversationMessage[];
}

// ── System prompt ────────────────────────────────────────────

function buildSystemPrompt(body: RequestBody): string {
  const sections: string[] = [];

  sections.push(`You are SplitCue's AI running coach. The user has an existing training plan and wants to make adjustments.

Your role is to:
1. Understand what the user wants to change
2. Provide a friendly coaching response explaining the adjustment
3. Return specific workout modifications as structured JSON

Be encouraging and explain WHY you're making the changes (e.g. "Moving your long run to Saturday gives you more recovery time after Thursday's tempo session").`);

  // Plan context
  const plan = body.plan_summary;
  const isPaceTarget = plan.goal_type === 'pace_target';
  const upcomingWorkouts = plan.workouts
    .filter((w) => w.status === "planned")
    .slice(0, 21); // Next 3 weeks

  let goalLine: string;
  if (isPaceTarget) {
    const paceStr = plan.goal_pace
      ? `${Math.floor(plan.goal_pace)}:${String(Math.round((plan.goal_pace - Math.floor(plan.goal_pace)) * 60)).padStart(2, '0')}/mi`
      : 'target pace';
    goalLine = `Goal: Hold ${paceStr} comfortably by ${plan.race_date} (pace development plan — no race)`;
  } else {
    goalLine = `Race: ${plan.race_type} on ${plan.race_date}`;
  }

  sections.push(`## Current Plan
Title: ${plan.title}
${goalLine}
Training days/week: ${plan.days_per_week}
Total weeks: ${plan.total_weeks}

### Upcoming Workouts (next 3 weeks)
${upcomingWorkouts.map((w) => `- ${w.date} (Week ${w.week_number}): ${w.day_label} [${w.status}]`).join("\n")}`);

  // Runner profile
  if (body.profile) {
    const parts: string[] = [];
    if (body.profile.experience_level) parts.push(`Experience: ${body.profile.experience_level}`);
    if (body.profile.easy_pace) {
      const m = Math.floor(body.profile.easy_pace);
      const s = Math.round((body.profile.easy_pace - m) * 60);
      parts.push(`Easy pace: ${m}:${s.toString().padStart(2, "0")}/mi`);
    }
    if (body.profile.fast_pace) {
      const m = Math.floor(body.profile.fast_pace);
      const s = Math.round((body.profile.fast_pace - m) * 60);
      parts.push(`Fast pace: ${m}:${s.toString().padStart(2, "0")}/mi`);
    }
    if (parts.length > 0) {
      sections.push(`## Runner Profile\n${parts.join(" | ")}`);
    }
  }

  // Output schema
  sections.push(`## CRITICAL RULES — READ FIRST

1. durationSeconds is in SECONDS. 30 minutes = 1800 seconds. 40 minutes = 2400 seconds. 60 minutes = 3600 seconds.
2. repeatCount means how many times to repeat the block. A simple run = repeatCount: 1. Only use repeatCount > 1 for actual interval repeats (e.g. "4 × 400m").
3. For easy/recovery runs, tempo runs, long runs, or any single-effort workout: the main effort in "blocks" is exactly ONE block with ONE interval and repeatCount: 1.
   - Example 30-minute easy run: blocks: [{"intervals": [{"type": "easy", "durationSeconds": 1800, "label": "Easy Run"}], "repeatCount": 1}]
   - Example 45-minute long run: blocks: [{"intervals": [{"type": "easy", "durationSeconds": 2700, "label": "Long Run"}], "repeatCount": 1}]
4. ALWAYS verify: (sum of all durationSeconds across all intervals × their block's repeatCount) ≈ what the user requested.
5. Do NOT over-structure simple workouts.
6. Keep the three sections separate. Warmup goes only in "warmup", the main work only in "blocks", and cooldown only in "cooldown". Never combine a warmup or cooldown with the main effort in the same block or interval.
   - Example tempo run with warmup and cooldown: warmup: [{"intervals": [{"type": "warmup", "durationSeconds": 600, "label": "Warm Up"}], "repeatCount": 1}], blocks: [{"intervals": [{"type": "hard", "durationSeconds": 1200, "label": "Tempo", "effort": 6}], "repeatCount": 1}], cooldown: [{"intervals": [{"type": "cooldown", "durationSeconds": 600, "label": "Cool Down"}], "repeatCount": 1}]
7. When editing an existing workout, keep every part the user didn't ask to change (durations, paces, efforts).

## Output Schema

Respond with ONLY a JSON object (no markdown fences):

{
  "message": "string — your coaching explanation of the changes",
  "modifications": [
    {
      "date": "YYYY-MM-DD",
      "action": "update" | "skip",
      "day_label": "string (if updating)",
      "description": "string (if updating)",
      "workout": WorkoutObject | null
    }
  ]
}

WorkoutObject = {
  "name": "string",
  "warmup": [RepeatBlock],
  "blocks": [RepeatBlock],
  "cooldown": [RepeatBlock]
}

RepeatBlock = {
  "intervals": [Interval],
  "repeatCount": number,
  "name": "string (optional)"
}

Interval = {
  "type": "warmup" | "hard" | "easy" | "cooldown",
  "durationSeconds": number,
  "label": "string (optional)",
  "effort": number (optional, RPE 1-10),
  "targetPace": number (optional, min/mile)
}

Rules:
- effort and targetPace are MUTUALLY EXCLUSIVE.
- Only include modifications for dates that need changes.
- action "skip" marks a workout as skipped (no workout data needed).
- action "update" replaces the workout for that date.
- If the user wants to swap two days, include both dates as "update" modifications.
- warmup and cooldown default to empty arrays for simple easy runs and include them for structured sessions (intervals, tempo, threshold). If the user asks to add or remove a warmup or cooldown, always do what they ask.
- Dates must be between ${plan.start_date} and ${plan.race_date}.
- Use null for any optional field you leave out (and for "workout" on skips).`);

  return sections.join("\n\n");
}

// ── Output schema & validation ───────────────────────────────

interface LegacyInterval {
  type: "warmup" | "hard" | "easy" | "cooldown";
  durationSeconds: number;
  label: string | null;
  effort: number | null;
  targetPace: number | null;
}

interface LegacyRepeatBlock {
  intervals: LegacyInterval[];
  repeatCount: number;
  name: string | null;
}

interface LegacyWorkout {
  name: string;
  warmup: LegacyRepeatBlock[];
  blocks: LegacyRepeatBlock[];
  cooldown: LegacyRepeatBlock[];
}

interface Adjustment {
  message: string;
  modifications: {
    date: string;
    action: "update" | "skip";
    day_label: string | null;
    description: string | null;
    workout: LegacyWorkout | null;
  }[];
}

const REPEAT_BLOCK_REF = { type: "array", items: { $ref: "#/$defs/repeatBlock" } };

const ADJUSTMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message", "modifications"],
  properties: {
    message: { type: "string" },
    modifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "action", "day_label", "description", "workout"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          action: { type: "string", enum: ["update", "skip"] },
          day_label: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          workout: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["name", "warmup", "blocks", "cooldown"],
                properties: {
                  name: { type: "string" },
                  warmup: REPEAT_BLOCK_REF,
                  blocks: REPEAT_BLOCK_REF,
                  cooldown: REPEAT_BLOCK_REF,
                },
              },
              { type: "null" },
            ],
          },
        },
      },
    },
  },
  $defs: {
    repeatBlock: {
      type: "object",
      additionalProperties: false,
      required: ["intervals", "repeatCount", "name"],
      properties: {
        intervals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "durationSeconds", "label", "effort", "targetPace"],
            properties: {
              type: { type: "string", enum: ["warmup", "hard", "easy", "cooldown"] },
              durationSeconds: { type: "number", description: "SECONDS. 30 minutes = 1800." },
              label: { type: ["string", "null"], description: "Short 1–4 word label, e.g. 'Easy Run'. No pacing advice." },
              effort: { type: ["number", "null"], description: "RPE 1-10" },
              targetPace: { type: ["number", "null"], description: "Decimal min/mile" },
            },
          },
        },
        repeatCount: { type: "integer" },
        name: { type: ["string", "null"] },
      },
    },
  },
};

function legacyWorkoutSeconds(w: LegacyWorkout): number {
  return [...w.warmup, ...w.blocks, ...w.cooldown].reduce(
    (sum, b) => sum + Math.max(1, b.repeatCount) * b.intervals.reduce((s, i) => s + (i.durationSeconds || 0), 0),
    0,
  );
}

function validateAdjustment(adj: Adjustment, plan: RequestBody["plan_summary"]): string[] {
  const problems: string[] = [];
  for (const mod of adj.modifications ?? []) {
    const at = `Modification for ${mod.date}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mod.date) || isNaN(Date.parse(mod.date))) {
      problems.push(`${at}: date must be a valid YYYY-MM-DD.`);
      continue;
    }
    if (mod.date < plan.start_date || mod.date > plan.race_date) {
      problems.push(`${at}: date is outside the plan (${plan.start_date} to ${plan.race_date}).`);
    }
    if (mod.action === "update" && !mod.day_label?.trim()) {
      problems.push(`${at}: updates need a day_label.`);
    }
    const w = mod.workout;
    if (mod.action !== "update" || !w) continue;

    const blocks = [...w.warmup, ...w.blocks, ...w.cooldown];
    if (w.blocks.length === 0) problems.push(`${at}: workout.blocks must not be empty.`);
    if (w.blocks.some((b) => b.intervals.some((i) => i.type === "warmup" || i.type === "cooldown"))) {
      problems.push(`${at}: warmup and cooldown intervals belong in workout.warmup and workout.cooldown, not in workout.blocks.`);
    }
    if (w.warmup.some((b) => b.intervals.some((i) => i.type !== "warmup" && i.type !== "easy"))) {
      problems.push(`${at}: workout.warmup may only contain warmup intervals; put the main effort in workout.blocks.`);
    }
    if (w.cooldown.some((b) => b.intervals.some((i) => i.type !== "cooldown" && i.type !== "easy"))) {
      problems.push(`${at}: workout.cooldown may only contain cooldown intervals; put the main effort in workout.blocks.`);
    }
    for (const b of blocks) {
      if (!Number.isInteger(b.repeatCount) || b.repeatCount < 1 || b.repeatCount > 50) {
        problems.push(`${at}: repeatCount must be a whole number between 1 and 50.`);
      }
      if (b.intervals.length === 0) problems.push(`${at}: every block needs at least one interval.`);
      if (b.intervals.some((i) => !(i.durationSeconds > 0))) {
        problems.push(`${at}: every interval needs durationSeconds > 0.`);
      }
      if (b.intervals.some((i) => i.targetPace != null && !(i.targetPace >= 3 && i.targetPace <= 25))) {
        problems.push(`${at}: targetPace must be a realistic decimal min/mile value.`);
      }
    }
    const minutes = legacyWorkoutSeconds(w) / 60;
    if (minutes < 5 || minutes > 300) {
      problems.push(`${at}: workout totals ~${Math.round(minutes)} min, which isn't realistic. durationSeconds is in SECONDS.`);
    }
  }
  return problems;
}

/** effort and targetPace are mutually exclusive; keep the pace. */
function normalizeLegacyWorkout(w: LegacyWorkout): LegacyWorkout {
  const fix = (blocks: LegacyRepeatBlock[]) =>
    blocks.map((b) => ({
      ...b,
      intervals: b.intervals.map((i) => (i.targetPace != null ? { ...i, effort: null } : i)),
    }));
  return { ...w, warmup: fix(w.warmup), blocks: fix(w.blocks), cooldown: fix(w.cooldown) };
}

// ── Handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const body: RequestBody = await req.json();

    if (!body.prompt || !body.plan_summary) {
      return new Response(
        JSON.stringify({ error: "prompt and plan_summary are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = buildSystemPrompt(body);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    if (body.conversation?.length) {
      for (const msg of body.conversation) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: body.prompt });

    const { data, problems } = await chatJson<Adjustment>({
      name: "plan_adjustment",
      model: MODELS.coach,
      messages,
      schema: ADJUSTMENT_SCHEMA,
      reasoningEffort: "medium",
      maxCompletionTokens: 16000,
      validate: (adj) => validateAdjustment(adj, body.plan_summary),
    });
    if (problems.length) {
      console.warn("adjust-plan: unresolved after retry", problems);
      throw new Error("The coach couldn't make that change cleanly. Try describing it a different way.");
    }

    const result = stripNulls({
      message: data.message,
      modifications: data.modifications.map((mod) => ({
        ...mod,
        workout: mod.action === "update" && mod.workout ? normalizeLegacyWorkout(mod.workout) : null,
      })),
    });

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("adjust-plan error:", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
