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
- Match workout duration to their typical run length unless they ask for something different`);
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
  "label": "string (optional) — human-readable label e.g. 'Sprint', 'Recovery Jog'",
  "target": { "type": "time" | "distance", "durationSeconds": number, "distanceMeters": number },
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
- A segment target can be TIME-BASED (type "time", durationSeconds > 0) or DISTANCE-BASED (type "distance", distanceMeters > 0). Use distance-based for track repeats (400m, 800m, mile repeats) and race-distance runs.
- For time-based targets, include durationSeconds in the target object. For distance-based, include distanceMeters.
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
}

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

    const messages: { role: string; content: string }[] = [
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

    // Call OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const completion = await response.json();
    const content = completion.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from OpenAI");
    }

    // Parse the JSON response
    const result = JSON.parse(content);

    return new Response(JSON.stringify(result), {
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
