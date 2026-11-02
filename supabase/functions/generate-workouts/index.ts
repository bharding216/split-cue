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

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Types ────────────────────────────────────────────────────

interface RunnerProfile {
  experience_level?: string;
  typical_run_minutes?: number;
  typical_run_minutes_max?: number;
  easy_pace?: number;
  fast_pace?: number;
  race_times?: Record<string, unknown>;
}

interface WorkoutRequest {
  date: string;
  day_label: string;
  description: string | null;
  week_number: number;
  week_theme: string;
  total_miles_target: number | null;
}

interface RequestBody {
  profile?: RunnerProfile;
  race_type: string;
  race_date: string;
  goal_time_minutes?: number | null;
  goal_type?: 'race' | 'pace_target';
  goal_pace?: number | null;
  days_per_week: number;
  total_weeks: number;
  workouts: WorkoutRequest[];
  /** Compact summary of the runner's actual recent runs and plan adherence. */
  history_summary?: string | null;
}

// ── System prompt ────────────────────────────────────────────

function buildSystemPrompt(body: RequestBody): string {
  const sections: string[] = [];

  const isPaceTarget = body.goal_type === 'pace_target';
  const raceLabel = body.race_type === 'custom'
    ? isPaceTarget ? 'pace development' : 'custom race'
    : body.race_type.replace('_', ' ');

  if (isPaceTarget) {
    const paceStr = body.goal_pace
      ? `${Math.floor(body.goal_pace)}:${String(Math.round((body.goal_pace - Math.floor(body.goal_pace)) * 60)).padStart(2, '0')}/mi`
      : 'target pace';
    sections.push(`You are SplitCue's AI running coach. You create detailed, structured workout definitions for specific training days within an existing plan.

You are generating detailed workouts for a ${raceLabel} plan (${body.total_weeks} weeks total, ${body.days_per_week} days/week, target pace: ${paceStr} by ${body.race_date}).

This is a pace development plan — NOT a race plan. Workouts should progressively build toward sustaining the target pace. Include tempo segments at or near goal pace and intervals slightly faster.

Each workout must be a complete structured interval workout matching the SplitCue format with warmup, blocks, and cooldown sections.`);
  } else {
    sections.push(`You are SplitCue's AI running coach. You create detailed, structured workout definitions for specific training days within an existing plan.

You are generating detailed workouts for a ${raceLabel} training plan (${body.total_weeks} weeks total, ${body.days_per_week} days/week, race on ${body.race_date}).

Each workout must be a complete structured interval workout matching the SplitCue format with warmup, blocks, and cooldown sections.`);
  }

  // Runner profile
  const profile = body.profile;
  if (profile) {
    const parts: string[] = [];
    if (profile.experience_level) parts.push(`Experience: ${profile.experience_level}`);
    if (profile.typical_run_minutes) {
      const max = profile.typical_run_minutes_max;
      parts.push(`Typical run: ${profile.typical_run_minutes}${max ? `–${max}` : ''} min`);
    }
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

  if (body.goal_time_minutes) {
    const hrs = Math.floor(body.goal_time_minutes / 60);
    const mins = Math.round(body.goal_time_minutes % 60);
    sections.push(`## Goal Time\n${hrs > 0 ? `${hrs}h ` : ''}${mins}m`);
  }

  if (body.history_summary) {
    sections.push(`## Recent Training (actual performance)
${body.history_summary}

Calibrate these workouts to how the runner is actually training, not just the original outline:
- Base paces on recent actual paces when they differ from the profile.
- If recent runs show strong progress (faster paces, consistent completion), progress normally or slightly faster.
- If workouts were missed, skipped, or recent volume is well below the plan, be conservative: hold or reduce volume and intensity rather than jumping ahead.
- Never increase weekly volume by more than ~10% over what the runner has recently been doing.`);
  }

  // The workouts to generate
  const workoutDescs = body.workouts.map((w) =>
    `- ${w.date} (Week ${w.week_number}, ${w.week_theme}): ${w.day_label}${w.description ? ` — ${w.description}` : ''}${w.total_miles_target ? ` [week target: ${w.total_miles_target} mi]` : ''}`
  ).join("\n");
  sections.push(`## Workouts to Generate\n${workoutDescs}`);

  // Output schema
  sections.push(`## Output Schema

Respond with ONLY a JSON object (no markdown fences, no extra text) matching:

{
  "workouts": [
    {
      "date": "YYYY-MM-DD",
      "workout": {
        "name": "string — short name matching the day_label",
        "category": "easy" | "tempo" | "intervals" | "long_run" | "race",
        "blocks": [WorkoutBlock],
        "targetDistanceMeters": number (optional) — total workout auto-finish distance in meters
      }
    }
  ]
}

WorkoutBlock = Segment | RepeatGroup

Segment = {
  "blockType": "segment",
  "segmentType": "warmup" | "run" | "recovery" | "rest" | "cooldown",
  "label": "string (optional)",
  "target": { "type": "time" | "distance", "durationSeconds": number, "distanceMeters": number },
  "intensity": "recovery" | "easy" | "moderate" | "tempo" | "hard" | "sprint" (optional),
  "targetPace": number (optional, min/mile e.g. 8.5 = 8:30/mi)
}

RepeatGroup = {
  "blockType": "repeat",
  "repetitions": number,
  "name": "string (optional)",
  "blocks": [WorkoutBlock]
}

Segment types:
- "warmup": warm-up at the start
- "run": main effort (intensity determines how hard)
- "recovery": active recovery between efforts (jog, walk)
- "rest": complete stop
- "cooldown": cool-down at the end

Intensity levels: "recovery" | "easy" | "moderate" | "tempo" | "hard" | "sprint"

Category meanings:
- "easy": recovery runs, easy-effort runs
- "tempo": sustained threshold / tempo efforts
- "intervals": structured speed work with repeating hard/easy blocks
- "long_run": endurance-building long runs (45+ min)
- "race": race simulations, time trials, race-distance runs

Rules:
- intensity and targetPace are MUTUALLY EXCLUSIVE per segment. Use at most one.
- If the runner has pace data, prefer targetPace for hard/tempo segments.
- A segment target can be TIME-BASED (type "time", durationSeconds > 0) or DISTANCE-BASED (type "distance", distanceMeters > 0).
- blocks must have at least one block.
- repetitions must be a positive integer (1 = no repeat, use a Segment instead).
- Put warmup segments at the start and cooldown at the end of the blocks array.
- Return one workout object per date requested, in the same order.
- Match the workout to the day_label and description from the plan outline.
- Scale intensity and volume to the training phase (week_theme) and weekly mileage target.
- targetDistanceMeters is optional — use for race-distance workouts (e.g. 5000 for 5K, 21097 for half marathon).

## Workout Reuse & Progressive Overload

Real training plans reuse the same core workouts across weeks with small progressions. Follow these principles:

- REUSE workout structures across weeks. If Week 3 has 4×800m repeats, Week 5 can use the same structure with 5×800m or a slightly faster target pace — don't invent a completely different interval workout.
- Limit interval variety. A good plan uses 3–5 distinct interval session types across the whole cycle (e.g. short repeats, long repeats, tempo intervals, fartlek). Vary the volume/intensity, not the format.
- Easy runs should be simple. An "Easy Run" is just a single easy segment — don't add intervals, strides, or complexity. Keep the structure identical across weeks, only adjusting duration.
- Long runs should also be simple unless the label explicitly says "progression" or "tempo finish."
- Progress through volume first (more repeats, longer duration), then intensity (faster pace, shorter recovery). Don't change the workout format each week.
- When multiple workouts in the same batch share the same day_label (e.g. two "Intervals" days), they can share the same structure — differentiate only by repeat count or pace target.`);

  return sections.join("\n\n");
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

    if (!body.workouts?.length) {
      return new Response(
        JSON.stringify({ error: "workouts array is required and must not be empty" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = buildSystemPrompt(body);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate detailed workouts for these ${body.workouts.length} training days.` },
        ],
        temperature: 0.7,
        max_tokens: 8192,
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

    const result = JSON.parse(content);

    return new Response(
      JSON.stringify(result),
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
