/**
 * generate-workout — Supabase Edge Function
 *
 * Receives the user's prompt, running profile, conversation history,
 * and a pre-aggregated workout history summary. Calls OpenAI to
 * generate a structured interval workout, acting as a running coach
 * that considers the user's actual training history.
 *
 * Deploy:  supabase functions deploy generate-workout
 * Secrets: supabase secrets set OPENAI_API_KEY=sk-...
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { chatJson, MODELS, newChatStats, type ChatMessage } from "../_shared/openai.ts";
import { startAiLog, type ClientMeta } from "../_shared/aiLog.ts";
import {
  WORKOUT_DEFS,
  normalizeWorkout,
  validateWorkout,
  type AIWorkout,
} from "../_shared/workoutValidation.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── System prompt ────────────────────────────────────────────

function buildSystemPrompt(body: RequestBody): string {
  const sections: string[] = [];

  // ── Role ────────────────────────────────────────────────
  sections.push(`You are SplitCue's AI running coach. You create structured interval workouts and act as a knowledgeable, encouraging coach who tailors recommendations to the runner's level, goals, and training history.

You respond in two parts:
1. A short, friendly "message" explaining the workout and WHY you chose it (reference their history/goals when relevant).
2. A "workout" JSON object matching the schema below.

Keep your message concise (2-4 sentences). Be specific — say things like "Since you did speed work yesterday, today's a good day for a tempo effort" rather than generic advice.`);

  // ── Runner profile ─────────────────────────────────────
  const profile = body.profile;
  if (profile) {
    const parts: string[] = [];
    if (profile.experience_level) parts.push(`Experience: ${profile.experience_level}`);
    if (profile.typical_run_minutes) parts.push(`Typical run: ${profile.typical_run_minutes} min`);
    if (profile.easy_pace) {
      const m = Math.floor(profile.easy_pace);
      const s = Math.round((profile.easy_pace - m) * 60);
      parts.push(`Easy pace: ${m}:${s.toString().padStart(2, "0")}/mi`);
    }
    if (profile.fast_pace) {
      const m = Math.floor(profile.fast_pace);
      const s = Math.round((profile.fast_pace - m) * 60);
      parts.push(`Fast pace: ${m}:${s.toString().padStart(2, "0")}/mi`);
    }
    if (parts.length > 0) {
      sections.push(`## Runner Profile\n${parts.join(" | ")}`);
    }
  }

  // ── Goals & preferences ────────────────────────────────
  if (body.goals?.length) {
    sections.push(`## Goals\n${body.goals.map((g) => `- ${g}`).join("\n")}`);
  }
  if (body.preferences?.length) {
    sections.push(
      `## Preferences\n${body.preferences.map((p) => `- ${p}`).join("\n")}`
    );
  }

  // ── Workout history (the coaching intelligence) ────────
  if (body.history_summary) {
    sections.push(`## Runner's Recent Training History
${body.history_summary}

Use this history to coach the runner:
- Suggest a workout TYPE they haven't done recently (e.g. hills if they've only done speed work)
- If they've worked out 5+ days this week or done several hard sessions in a row, suggest recovery or an easy day
- If they've been off for a while (7+ days since last workout), ease them back in with a lighter session
- Consider progressive overload if volume and intensity have been consistent
- Reference their actual history in your message (e.g. "Since your last 3 workouts were speed-focused, let's mix in some tempo work today")
- Match workout duration to their typical run length unless they ask for a specific time or distance`);
  }

  // ── Output schema ──────────────────────────────────────
  sections.push(`## Output Schema

Respond with ONLY a JSON object (no markdown fences, no extra text) matching:

{
  "message": "string — your coaching message to the runner",
  "workout": {
    "name": "string — short workout name, e.g. 'Tempo Run' or 'Hill Repeats'",
    "category": "easy" | "tempo" | "intervals" | "long_run" | "race" | "other",
    "blocks": [WorkoutBlock],
    "targetDistanceMeters": number (optional) — total workout auto-finish distance in meters
  }
}

WorkoutBlock = Segment | RepeatGroup

Segment = {
  "blockType": "segment",
  "segmentType": "warmup" | "run" | "recovery" | "rest" | "cooldown",
  "label": "string (optional) — short 1–4 word label e.g. 'Sprint', 'Recovery Jog'; no pacing advice",
  "target": { "type": "time", "durationSeconds": number } | { "type": "distance", "distanceMeters": number },
  "intensity": "recovery" | "easy" | "moderate" | "tempo" | "hard" | "sprint" (optional),
  "targetPace": number (optional) — min/mile e.g. 8.5 = 8:30/mi
}

RepeatGroup = {
  "blockType": "repeat",
  "repetitions": number,
  "name": "string (optional)",
  "blocks": [WorkoutBlock]
}

Segment types:
- "warmup": warm-up segments at the start of the workout
- "run": the main effort segments (intensity determines how hard)
- "recovery": active recovery between hard efforts (jog, walk)
- "rest": complete stop/standing rest
- "cooldown": cool-down segments at the end

Intensity levels:
- "recovery": very easy, used for segment type "recovery"
- "easy": conversational pace
- "moderate": comfortably hard
- "tempo": lactate threshold effort
- "hard": VO2max / speed work effort
- "sprint": near-max sprint effort

Category meanings:
- "easy": recovery runs, easy-effort runs
- "tempo": sustained threshold / tempo efforts
- "intervals": structured speed work with repeating hard/easy blocks
- "long_run": endurance-building long runs (45+ min)
- "race": race simulations, time trials, race-distance runs
- "other": anything that doesn't clearly fit one of the above

Category rules:
- ALWAYS include "category". It must describe what the runner asked for — a tempo run is "tempo" even when its segments use targetPace instead of intensity.
- Never default to "easy" when unsure; use "other".

Rules:
- intensity and targetPace are MUTUALLY EXCLUSIVE per segment. Use at most one.
- If the runner's profile includes pace data, prefer targetPace for hard/tempo segments.
- Otherwise use intensity.
- A segment target can be TIME-BASED (type "time", durationSeconds > 0) or DISTANCE-BASED (type "distance", distanceMeters > 0).
- Honor the unit the runner asks for. If they give a distance ("4 miles", "a 10K", "6 x 800m"), use DISTANCE-BASED targets for those segments. If they give a time ("30 minutes", "5 x 3 min"), use TIME-BASED targets.
- NEVER convert a requested distance into a duration using a pace (e.g. "4 miles at 8:00/mi" is a 4-mile distance segment with targetPace 8.0, NOT a 32-minute segment). A target pace only sets how fast to run; it does not change the target type.
- Convert distances to meters: 1 mile = 1609.344 m, 1 km = 1000 m (e.g. 4 miles = 6437.376).
- When the runner asks for a total run distance, the run segments plus any warmup/cooldown must add up to that distance. If you add a warmup or cooldown, make them distance-based too and shorten the main segment accordingly.
- Use distance-based targets for track repeats (400m, 800m, mile repeats) and race-distance runs even when the runner doesn't specify a unit.
- For time-based targets, set durationSeconds and leave distanceMeters null. For distance-based, set distanceMeters and leave durationSeconds null.
- Use null for any optional field you leave out.
- blocks must have at least one block.
- repetitions must be a positive integer (1 = no repeat, just use a Segment instead).
- Use RepeatGroups for interval sets: e.g. 6× (3 min run + 2 min recovery).
- Put warmup segments at the start and cooldown at the end of the blocks array — they are top-level Segments, not inside RepeatGroups.
- targetDistanceMeters is optional — use for race-distance workouts (e.g. 5000 for 5K, 21097 for half marathon).`);

  return sections.join("\n\n");
}

// ── Types ────────────────────────────────────────────────────

interface RunnerProfile {
  experience_level?: string;
  typical_run_minutes?: number;
  easy_pace?: number;
  fast_pace?: number;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  prompt: string;
  profile?: RunnerProfile;
  goals?: string[];
  preferences?: string[];
  conversation?: ConversationMessage[];
  history_summary?: string | null;
  client?: ClientMeta;
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message", "workout"],
  properties: {
    message: { type: "string" },
    workout: { $ref: "#/$defs/workout" },
  },
  $defs: WORKOUT_DEFS,
};

// ── Handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const body: RequestBody = await req.json();

    if (!body.prompt) {
      return new Response(
        JSON.stringify({ error: "prompt is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Build the messages array for OpenAI
    const systemPrompt = buildSystemPrompt(body);

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history (prior turns in this chat session)
    if (body.conversation?.length) {
      for (const msg of body.conversation) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add the current user prompt
    messages.push({ role: "user", content: body.prompt });

    // No fast-pace ceiling here: the runner may explicitly ask for paces beyond their profile.
    const paces = { easyPace: body.profile?.easy_pace };
    const { client, ...loggedRequest } = body;
    const log = startAiLog(req, {
      functionName: "generate-workout",
      model: MODELS.coach,
      client,
      request: loggedRequest,
      fallbackUserText: body.prompt,
    });
    const stats = newChatStats();

    let data: { message: string; workout: AIWorkout };
    let problems: string[];
    try {
      ({ data, problems } = await chatJson<{ message: string; workout: AIWorkout }>({
        name: "workout",
        model: MODELS.coach,
        messages,
        schema: RESPONSE_SCHEMA,
        reasoningEffort: "low",
        maxCompletionTokens: 12000,
        validate: (result) => validateWorkout(result.workout, paces),
        stats,
      }));
    } catch (err) {
      log.finish({ status: "error", stats, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
    const workout = normalizeWorkout(data.workout);
    if (problems.length) {
      console.warn("generate-workout: unresolved after retry", problems);
      if (validateWorkout(workout, paces).length) {
        log.finish({ status: "invalid", stats, response: data });
        throw new Error("The coach couldn't build a valid workout for that. Try rephrasing your request.");
      }
    }

    const result = { message: data.message, workout };
    log.finish({ status: "ok", stats, response: result });

    return new Response(JSON.stringify({ ...result, request_id: log.id }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("generate-workout error:", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
