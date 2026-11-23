/**
 * strava-webhook — Supabase Edge Function
 *
 * Receives Strava webhook events (push subscriptions). The critical event
 * is athlete deauthorization: when a user revokes SplitCue from Strava's
 * settings, Strava POSTs an event here and we delete the stale
 * strava_connections row so the athlete-capacity count stays accurate.
 *
 * Subscription setup (one-time, via curl):
 *   POST https://www.strava.com/api/v3/push_subscriptions
 *     client_id=...&client_secret=...&
 *     callback_url=https://oakhqqrxsavmoeqlzcny.supabase.co/functions/v1/strava-webhook&
 *     verify_token=<STRAVA_WEBHOOK_VERIFY_TOKEN>
 *
 * Deploy:  supabase functions deploy strava-webhook --no-verify-jwt
 * Secrets: supabase secrets set STRAVA_WEBHOOK_VERIFY_TOKEN=...
 *
 * The --no-verify-jwt flag is required because Strava sends unsigned
 * requests; we authenticate via the verify token and subscription ID.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN") ?? "";

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Strava webhook event shape ───────────────────────────────

interface StravaWebhookEvent {
  /** "athlete" or "activity" */
  object_type: string;
  /** The Strava athlete ID (owner of the activity or the athlete itself). */
  owner_id: number;
  /** "create", "update", or "delete" */
  aspect_type: string;
  /** The object ID (athlete ID for athlete events, activity ID for activity events). */
  object_id: number;
  /** Changed fields; for deauth: { "authorized": "false" } */
  updates: Record<string, string>;
  subscription_id: number;
  event_time: number;
}

// ── Handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  // ── GET: Subscription validation ────────────────────────────
  // Strava sends hub.mode, hub.verify_token, and hub.challenge.
  // Respond with the challenge to confirm the subscription.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      console.log("Strava webhook subscription validated");
      return new Response(JSON.stringify({ "hub.challenge": challenge }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Forbidden", { status: 403 });
  }

  // ── POST: Webhook event ─────────────────────────────────────
  if (req.method === "POST") {
    let event: StravaWebhookEvent;
    try {
      event = await req.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    // Deauthorization: athlete revoked access from Strava's settings.
    // object_type is "athlete" and updates.authorized is "false".
    if (
      event.object_type === "athlete" &&
      event.updates?.authorized === "false"
    ) {
      const stravaAthleteId = event.owner_id;
      console.log(
        `Strava deauthorization received for athlete ${stravaAthleteId}`,
      );

      const db = adminClient();
      const { error } = await db
        .from("strava_connections")
        .delete()
        .eq("strava_athlete_id", stravaAthleteId);

      if (error) {
        console.error("Failed to delete strava connection:", error);
      } else {
        console.log(
          `Deleted strava_connections row for athlete ${stravaAthleteId}`,
        );
      }
    }

    // Strava requires a 200 response for all events, even ones we ignore.
    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});
