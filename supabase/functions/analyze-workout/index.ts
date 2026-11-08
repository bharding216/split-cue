/**
 * analyze-workout — Supabase Edge Function
 *
 * Evaluates a completed workout against its plan prescription
 * and recent training history. Returns a structured performance
 * analysis and optional plan adjustment recommendations.
 *
 * Deploy:  supabase functions deploy analyze-workout
 * Secrets: supabase secrets set OPENAI_API_KEY=sk-...
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { chatJson, MODELS, stripNulls } from "../_shared/openai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  completed_workout: {
    name: string;
    total_duration_ms: number;
    total_distance_meters?: number | null;
    splits?: {
      label?: string;
      type?: string;
      pace_min_per_mile: number;
      distance_meters: number;
      target_pace?: number | null;
    }[];
    average_pace_min_per_mile?: number | null;
  };
  planned_workout?: {
    day_label: string;
    description?: string;
    workout_data?: unknown;
  } | null;
  profile?: {
    experience_level?: string;
    easy_pace?: number;
    fast_pace?: number;
  } | null;
  recent_history_summary?: string | null;
  today?: string;
  upcoming_workouts?: { date: string; day_label: string; description: string | null }[];
  missed_workouts_last_14_days?: number;
}

function formatPace(pace: number): string {
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')}/mi`;
}

interface Analysis {
  performance_rating: string;
  fatigue_signal: string;
  key_observations: string[];
  recommendation: string;
  coach_message: string;
  plan_update: {
    requires_changes: boolean;
    reason: string;
    workout_changes: {
      date: string;
      action: "update" | "skip";
      day_label: string | null;
      description: string | null;
    }[];
  };
}

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["performance_rating", "fatigue_signal", "key_observations", "recommendation", "coach_message", "plan_update"],
  properties: {
    performance_rating: { type: "string", enum: ["on_target", "exceeded", "struggled", "incomplete"] },
    fatigue_signal: { type: "string", enum: ["normal", "elevated", "concerning"] },
    key_observations: { type: "array", items: { type: "string" }, description: "2-3 bullet points" },
    recommendation: { type: "string", enum: ["maintain", "increase", "decrease", "rest"] },
    coach_message: { type: "string", description: "2-3 sentence personalized feedback" },
    plan_update: {
      type: "object",
      additionalProperties: false,
      required: ["requires_changes", "reason", "workout_changes"],
      properties: {
        requires_changes: { type: "boolean" },
        reason: { type: "string" },
        workout_changes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["date", "action", "day_label", "description"],
            properties: {
              date: { type: "string", description: "YYYY-MM-DD from UPCOMING WORKOUTS" },
              action: { type: "string", enum: ["update", "skip"] },
              day_label: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
};

function validateAnalysis(a: Analysis, allowedDates: Set<string>): string[] {
  const problems: string[] = [];
  const changes = a.plan_update.workout_changes;
  if (!a.plan_update.requires_changes && changes.length) {
    problems.push("workout_changes must be empty when requires_changes is false.");
  }
  for (const c of changes) {
    if (!allowedDates.has(c.date)) {
      problems.push(`workout_changes date ${c.date} is not in UPCOMING WORKOUTS; only use those dates.`);
    }
    if (c.action === "update" && !(c.day_label?.trim() && c.description?.trim())) {
      problems.push(`workout_changes for ${c.date}: updates need both day_label and a specific description.`);
    }
  }
  return problems;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const body: RequestBody = await req.json();

    const systemPrompt = `You are a running coach AI for the SplitCue app. Analyze the completed workout and provide a structured performance assessment.

You MUST respond with valid JSON matching this exact schema:
{
  "performance_rating": "on_target" | "exceeded" | "struggled" | "incomplete",
  "fatigue_signal": "normal" | "elevated" | "concerning",
  "key_observations": ["string", "string"],  // 2-3 bullet points
  "recommendation": "maintain" | "increase" | "decrease" | "rest",
  "coach_message": "string",  // 2-3 sentence personalized feedback
  "plan_update": {
    "requires_changes": boolean,
    "reason": "string",
    "workout_changes": [
      {
        "date": "YYYY-MM-DD",
        "action": "update" | "skip",
        "day_label": "string",
        "description": "string"
      }
    ]
  }
}

Guidelines:
- Be encouraging but honest about performance
- If the runner completed the workout at target, say "maintain"
- If they exceeded targets comfortably, consider "increase" for future workouts
- If they struggled (pace faded, couldn't complete), suggest "decrease"
- Only recommend plan changes when there's a meaningful signal, not after every workout
- A successful workout on target should usually result in requires_changes: false
- For fatigue signals, look for pace fade across intervals, much slower than targets, or very short duration
- Repeated missed workouts are a signal to ease volume for consistency, not to cram missed work in
- workout_changes may ONLY use dates listed under UPCOMING WORKOUTS. Never change today's run or invent new dates
- Each change replaces that day's label and description; the detailed workout is regenerated from them, so make the description specific (duration or distance, effort, and pace guidance)
- Keep changes minimal: usually 1-3 upcoming days, the ones most affected by this run`;

    const userContent = `Analyze this completed workout:

COMPLETED WORKOUT:
- Name: ${body.completed_workout.name}
- Duration: ${Math.round(body.completed_workout.total_duration_ms / 60000)} minutes
${body.completed_workout.total_distance_meters ? `- Distance: ${(body.completed_workout.total_distance_meters / 1609.344).toFixed(2)} miles` : ''}
${body.completed_workout.average_pace_min_per_mile ? `- Average pace: ${Math.floor(body.completed_workout.average_pace_min_per_mile)}:${Math.round((body.completed_workout.average_pace_min_per_mile % 1) * 60).toString().padStart(2, '0')}/mi` : ''}
${body.completed_workout.splits?.length ? `- Splits:\n${body.completed_workout.splits.map((s, i) => `  ${i + 1}. ${s.label ?? s.type ?? 'Split'}: ${formatPace(s.pace_min_per_mile)} over ${Math.round(s.distance_meters)}m${s.target_pace ? ` (target ${formatPace(s.target_pace)})` : ''}`).join('\n')}` : ''}

${body.planned_workout ? `PLANNED WORKOUT:
- Label: ${body.planned_workout.day_label}
- Description: ${body.planned_workout.description || 'N/A'}` : 'No planned workout prescription available.'}

${body.profile ? `RUNNER PROFILE:
- Experience: ${body.profile.experience_level || 'unknown'}
- Easy pace: ${body.profile.easy_pace ? `${Math.floor(body.profile.easy_pace)}:${Math.round((body.profile.easy_pace % 1) * 60).toString().padStart(2, '0')}/mi` : 'unknown'}
- Fast pace: ${body.profile.fast_pace ? `${Math.floor(body.profile.fast_pace)}:${Math.round((body.profile.fast_pace % 1) * 60).toString().padStart(2, '0')}/mi` : 'unknown'}` : ''}

${body.recent_history_summary ? `RECENT TRAINING CONTEXT:\n${body.recent_history_summary}` : ''}
${body.missed_workouts_last_14_days ? `\nMissed plan workouts in the last 14 days: ${body.missed_workouts_last_14_days}` : ''}

${body.today ? `TODAY: ${body.today}` : ''}

UPCOMING WORKOUTS (the only dates you may change):
${body.upcoming_workouts?.length
  ? body.upcoming_workouts.map((w) => `- ${w.date}: ${w.day_label}${w.description ? ` — ${w.description}` : ''}`).join('\n')
  : 'None — set requires_changes to false.'}`;

    const allowedDates = new Set((body.upcoming_workouts ?? []).map((w) => w.date));

    let result;
    try {
      result = await chatJson<Analysis>({
        name: "workout_analysis",
        model: MODELS.fast,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        schema: ANALYSIS_SCHEMA,
        reasoningEffort: "low",
        maxCompletionTokens: 6000,
        validate: (a) => validateAnalysis(a, allowedDates),
      });
    } catch (err) {
      console.error("analyze-workout OpenAI failure:", err);
      return new Response(
        JSON.stringify({ error: "Failed to analyze workout" }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
    if (result.problems.length) console.warn("analyze-workout: unresolved after retry", result.problems);

    const analysis = result.data;
    const changes = analysis.plan_update.workout_changes.filter(
      (c) => allowedDates.has(c.date) && (c.action === "skip" || (c.day_label?.trim() && c.description?.trim())),
    );
    analysis.plan_update.workout_changes = analysis.plan_update.requires_changes ? changes : [];
    analysis.plan_update.requires_changes = analysis.plan_update.workout_changes.length > 0;

    return new Response(JSON.stringify(stripNulls(analysis)), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-workout error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
