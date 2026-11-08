/**
 * generate-workouts — Supabase Edge Function
 *
 * On-demand batch workout detail generator. Given plan context and a
 * list of dates, returns full structured WorkoutObjects for those dates.
 * Typically called for 3 workouts at a time.
 *
 * Deploy:  supabase functions deploy generate-workouts
 * Secrets: supabase secrets set OPENAI_API_KEY=sk-...
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { chatJson, MODELS } from "../_shared/openai.ts";
import { normalizeWorkout, type PaceContext } from "../_shared/workoutValidation.ts";
import {
  BATCH_SCHEMA,
  buildSystemPrompt,
  validateBatch,
  type RequestBody,
  type WorkoutBatch,
} from "./prompt.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    if (!body.workouts?.length) {
      return new Response(
        JSON.stringify({ error: "workouts array is required and must not be empty" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = buildSystemPrompt(body);
    const paces: PaceContext = { easyPace: body.profile?.easy_pace, fastPace: body.profile?.fast_pace };

    const { data, problems } = await chatJson<WorkoutBatch>({
      name: "plan_workouts",
      model: MODELS.coach,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate detailed workouts for these ${body.workouts.length} training days.` },
      ],
      schema: BATCH_SCHEMA,
      reasoningEffort: "low",
      maxCompletionTokens: 24000,
      validate: (batch) => validateBatch(batch, body.workouts, paces),
    });
    if (problems.length) console.warn("generate-workouts: unresolved after retry", problems);

    // Only return workouts for requested dates that passed validation, so a bad
    // day is regenerated later instead of being saved.
    const badDates = new Set(problems.map((p) => p.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]).filter(Boolean));
    const requested = new Set(body.workouts.map((w) => w.date));
    const workouts = (data.workouts ?? [])
      .filter((w) => requested.has(w.date) && !badDates.has(w.date))
      .map((w) => ({ date: w.date, workout: normalizeWorkout(w.workout) }));

    return new Response(
      JSON.stringify({ workouts }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("generate-workouts error:", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
