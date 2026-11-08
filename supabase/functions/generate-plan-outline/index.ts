/**
 * generate-plan-outline — Supabase Edge Function
 *
 * Fast single-call plan generator that returns only week-level data:
 * themes, volume targets, day labels, and coaching descriptions, plus a
 * high-level approach and phase breakdown the runner reviews before saving.
 * No detailed workout objects (intervals, warmup, blocks, cooldown).
 *
 * Pass `revision` to revise a previously proposed outline from runner feedback.
 *
 * Detailed workouts are generated on-demand by `generate-workouts`.
 *
 * Free users get one AI plan; the quota is checked here against the
 * plan_generations ledger so it can't be bypassed client-side.
 *
 * Deploy:  supabase functions deploy generate-plan-outline
 * Secrets: supabase secrets set OPENAI_API_KEY=sk-...
 *          Optional: PLAN_QUOTA_EXEMPT_USER_IDS=uuid1,uuid2 (e.g. dev accounts
 *          testing Pro via the in-app tier override)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { chatJson, MODELS } from "../_shared/openai.ts";
import {
  OUTLINE_SCHEMA,
  repairOutline,
  validateOutline,
  type CompactOutline,
  type CompactWeek,
} from "../_shared/planValidation.ts";
import {
  buildMessages,
  buildSystemPrompt,
  formatPaceMi,
  outlineContext,
  planDimensions,
  type PlanPhase,
  type RequestBody,
} from "./prompt.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QUOTA_EXEMPT_USER_IDS = new Set(
  (Deno.env.get("PLAN_QUOTA_EXEMPT_USER_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};


// ── Expand compact outline into dated format ─────────────────

function expandCompactOutline(
  compactWeeks: CompactWeek[],
  startDate: string,
) {
  const start = new Date(startDate + 'T00:00:00');

  return compactWeeks.map((week, weekIdx) => ({
    week_number: weekIdx + 1,
    theme: week.theme,
    total_miles_target: week.miles,
    days: week.days.map((day, dayIdx) => {
      const d = new Date(start);
      d.setDate(d.getDate() + weekIdx * 7 + dayIdx);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      if (!day[0]) {
        return { date: dateStr, day_label: 'Rest Day', description: null };
      }
      return { date: dateStr, day_label: day[0], description: day[1] ?? null };
    }),
  }));
}

function sanitizePhases(raw: unknown, totalWeeks: number): PlanPhase[] | null {
  if (!Array.isArray(raw)) return null;
  const phases = raw
    .map((p) => ({
      start_week: Math.max(1, Math.round(Number(p?.start_week))),
      end_week: Math.min(totalWeeks, Math.round(Number(p?.end_week))),
      name: typeof p?.name === "string" ? p.name.trim() : "",
      focus: typeof p?.focus === "string" ? p.focus.trim() : "",
    }))
    .filter((p) => isFinite(p.start_week) && isFinite(p.end_week) && p.start_week <= p.end_week && p.name)
    .sort((a, b) => a.start_week - b.start_week);
  return phases.length > 0 ? phases : null;
}

// ── Plan quota ───────────────────────────────────────────────

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getAuthUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const { data: { user }, error } = await adminClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) return null;
  return user.id;
}

interface SubscriptionRow {
  tier: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

/** Mirrors getEffectiveTier in the app's SubscriptionContext. */
function isPro(sub: SubscriptionRow | null): boolean {
  if (!sub) return false;
  const now = Date.now();
  if (sub.tier === "pro" && sub.status === "active") return true;
  if (sub.status === "trialing" && sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > now) return true;
  if (sub.status === "canceled" && sub.current_period_end && new Date(sub.current_period_end).getTime() > now) return true;
  return false;
}

/** First AI plan is free for everyone; additional plans require Pro. */
async function canGeneratePlan(userId: string): Promise<boolean> {
  if (QUOTA_EXEMPT_USER_IDS.has(userId)) return true;

  const [subResult, countResult] = await Promise.all([
    adminClient
      .from("subscriptions")
      .select("tier, status, trial_ends_at, current_period_end")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient
      .from("plan_generations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  if (subResult.error) throw new Error(`Failed to load subscription: ${subResult.error.message}`);
  if (countResult.error) throw new Error(`Failed to load plan count: ${countResult.error.message}`);

  return isPro(subResult.data as SubscriptionRow | null) || (countResult.count ?? 0) === 0;
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

    const userId = await getAuthUserId(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in to create a training plan." }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
    if (!(await canGeneratePlan(userId))) {
      return new Response(
        JSON.stringify({ error: "You've used your free training plan. Upgrade to SplitCue Pro to create another." }),
        { status: 402, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const body: RequestBody = await req.json();

    if (!body.race_type || !body.race_date || !body.start_date || !body.days_per_week) {
      return new Response(
        JSON.stringify({ error: "race_type, race_date, start_date, and days_per_week are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const dims = planDimensions(body.start_date, body.race_date);
    const systemPrompt = buildSystemPrompt(body, dims);
    const isPaceGoal = body.goal_type === 'pace_target';

    const outlineCtx = outlineContext(body, dims);

    const { data: generated, problems } = await chatJson<CompactOutline>({
      name: "plan_outline",
      model: MODELS.coach,
      messages: buildMessages(body, systemPrompt, dims),
      schema: OUTLINE_SCHEMA,
      reasoningEffort: "medium",
      maxCompletionTokens: 32000,
      validate: (outline) => validateOutline(outline, outlineCtx),
    });

    let compact = generated;
    if (problems.length) {
      const repaired = repairOutline(generated, outlineCtx);
      if (!repaired) {
        throw new Error("We couldn't build a complete plan this time. Please try again.");
      }
      const remaining = validateOutline(repaired, outlineCtx);
      if (remaining.length) console.warn("generate-plan-outline: unresolved after repair", remaining);
      compact = repaired;
    }

    // Expand compact tuples into dated day objects (same shape the client expects)
    const weeks = expandCompactOutline(compact.weeks, body.start_date);

    let suggestedGoalPace: number | null = null;
    if (isPaceGoal && !body.goal_pace) {
      const raw = Number(compact.goal_pace);
      if (isFinite(raw) && raw >= 4 && raw <= 20) {
        suggestedGoalPace = Math.round(raw * 12) / 12; // nearest 5 seconds
      }
    }

    // Build title
    const targetMonth = new Date(body.race_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    let title: string;
    if (isPaceGoal) {
      const pace = body.goal_pace ?? suggestedGoalPace;
      title = `${pace ? formatPaceMi(pace) : 'Pace'} Goal - ${targetMonth}`;
    } else {
      const raceLabel = body.race_type === 'custom'
        ? 'Custom Race'
        : body.race_type.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      title = `${raceLabel} Training - ${targetMonth}`;
    }

    const approach = typeof compact.approach === "string" && compact.approach.trim()
      ? compact.approach.trim()
      : null;
    const message = body.revision && typeof compact.message === "string" && compact.message.trim()
      ? compact.message.trim()
      : null;

    return new Response(
      JSON.stringify({
        title,
        weeks,
        suggested_goal_pace: suggestedGoalPace,
        approach,
        phases: sanitizePhases(compact.phases, weeks.length),
        message,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("generate-plan-outline error:", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
