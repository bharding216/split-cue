/**
 * strava-push — Supabase Edge Function
 *
 * Uploads a completed workout to Strava. Accepts workout metadata and
 * an optional GPX string. Handles token refresh automatically.
 *
 * If GPX is provided, uses the Strava upload endpoint (POST /api/v3/uploads).
 * Otherwise falls back to creating a manual activity (POST /api/v3/activities).
 *
 * Deploy:  supabase functions deploy strava-push
 * Secrets: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET (shared with strava-auth)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STRAVA_CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID")!;
const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status);
}

async function getAuthUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user.id;
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Token refresh ────────────────────────────────────────────

interface StravaTokens {
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

/**
 * Returns a valid access token, refreshing if expired.
 * Updates the DB row when a refresh occurs.
 */
async function getValidToken(
  userId: string,
  conn: StravaTokens,
): Promise<string> {
  const expiresAt = new Date(conn.token_expires_at).getTime();
  const now = Date.now();

  // Still valid (with 60s buffer)
  if (expiresAt - now > 60_000) {
    return conn.access_token;
  }

  // Refresh the token
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Strava token refresh failed:", res.status, errText);
    throw new Error("Strava token refresh failed — user may need to reconnect");
  }

  const data = await res.json();
  const { access_token, refresh_token, expires_at } = data;

  // Persist the refreshed tokens
  const db = adminClient();
  await db
    .from("strava_connections")
    .update({
      access_token,
      refresh_token,
      token_expires_at: new Date(expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return access_token;
}

// ── Upload helpers ───────────────────────────────────────────

/** Upload a GPX file to Strava's upload endpoint. */
async function uploadGpx(
  accessToken: string,
  gpx: string,
  name: string,
  description: string,
  trainer: boolean,
  stravaTags: string[],
): Promise<{ uploadId: number; activityId?: number }> {
  const formData = new FormData();
  formData.append("file", new Blob([gpx], { type: "application/gpx+xml" }), "workout.gpx");
  formData.append("data_type", "gpx");
  formData.append("name", name);
  formData.append("description", description);
  formData.append("sport_type", "Run");
  if (trainer) formData.append("trainer", "1");
  for (const tag of stravaTags) formData.append(`tags[${tag}]`, "true");

  const res = await fetch("https://www.strava.com/api/v3/uploads", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Strava GPX upload failed:", res.status, errText);

    // Check for duplicate activity
    if (res.status === 409 || errText.includes("duplicate")) {
      throw new Error("This workout has already been uploaded to Strava");
    }
    throw new Error(`Strava upload failed: ${res.status}`);
  }

  const data = await res.json();

  // The upload API returns an upload object. If the activity is already
  // processed it will have an activity_id; otherwise poll for it.
  let activityId = data.activity_id ?? undefined;

  if (!activityId && data.id) {
    // Poll for up to 15 seconds for the upload to process
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(
        `https://www.strava.com/api/v3/uploads/${data.id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (pollRes.ok) {
        const poll = await pollRes.json();
        if (poll.activity_id) {
          activityId = poll.activity_id;
          break;
        }
        if (poll.error) {
          if (poll.error.includes("duplicate")) {
            throw new Error("This workout has already been uploaded to Strava");
          }
          throw new Error(`Strava processing error: ${poll.error}`);
        }
      }
    }
  }

  return { uploadId: data.id, activityId };
}

/** Create a manual activity (no GPS route). */
async function createManualActivity(
  accessToken: string,
  name: string,
  startDate: string,
  elapsedSeconds: number,
  distanceMeters: number | undefined,
  description: string,
  trainer: boolean,
  stravaTags: string[],
): Promise<{ activityId: number }> {
  const body = new URLSearchParams({
    name,
    sport_type: "Run",
    start_date_local: startDate,
    elapsed_time: String(elapsedSeconds),
    type: "Run",
    description,
  });

  if (trainer) {
    body.append("trainer", "1");
  }

  if (distanceMeters != null && distanceMeters > 0) {
    body.append("distance", String(distanceMeters));
  }

  for (const tag of stravaTags) body.append(`tags[${tag}]`, "true");

  const res = await fetch("https://www.strava.com/api/v3/activities", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Strava manual activity failed:", res.status, errText);
    throw new Error(`Failed to create Strava activity: ${res.status}`);
  }

  const data = await res.json();
  return { activityId: data.id };
}

// ── Main handler ─────────────────────────────────────────────

interface PushRequest {
  workoutName: string;
  completedAt: number; // epoch ms
  totalDurationMs: number;
  totalDistanceMeters?: number;
  gpx?: string; // GPX XML string (optional)
  tags?: string[];
  notes?: string;
}

function buildDescription(notes: string | undefined): string {
  const parts: string[] = [];
  const trimmedNotes = notes?.trim();
  if (trimmedNotes) parts.push(trimmedNotes);
  parts.push("Recorded with SplitCue");
  return parts.join("\n\n");
}

/**
 * Strava only accepts these activity tags: WithPet, Recovery, Competition,
 * ForACause, Commute. Any other tag is rejected.
 */
function toStravaTags(tags: string[] | undefined): string[] {
  const stravaTags: string[] = [];
  if (tags?.includes("Race")) stravaTags.push("Competition");
  return stravaTags;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return errorResponse("Unauthorized", 401);
    }

    const body: PushRequest = await req.json();
    const { workoutName, completedAt, totalDurationMs, totalDistanceMeters, gpx } = body;
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string")
      : undefined;
    const notes = typeof body.notes === "string" ? body.notes : undefined;

    if (!workoutName || !completedAt || !totalDurationMs) {
      return errorResponse("workoutName, completedAt, and totalDurationMs are required", 400);
    }

    // Load the user's Strava connection
    const db = adminClient();
    const { data: conn, error: connError } = await db
      .from("strava_connections")
      .select("access_token, refresh_token, token_expires_at")
      .eq("user_id", userId)
      .single();

    if (connError || !conn) {
      return errorResponse("No Strava account connected. Connect Strava in Settings first.", 404);
    }

    // Get a valid (possibly refreshed) access token
    const accessToken = await getValidToken(userId, conn);

    const elapsedSeconds = Math.round(totalDurationMs / 1000);
    const startDate = new Date(completedAt - totalDurationMs).toISOString();
    const description = buildDescription(notes);
    const trainer = tags?.includes("Treadmill") ?? false;
    const stravaTags = toStravaTags(tags);

    if (gpx) {
      // Upload with GPS route
      const result = await uploadGpx(accessToken, gpx, workoutName, description, trainer, stravaTags);
      return jsonResponse({
        success: true,
        uploadId: result.uploadId,
        activityId: result.activityId,
      });
    } else {
      // Create a manual activity without GPS
      const result = await createManualActivity(
        accessToken,
        workoutName,
        startDate,
        elapsedSeconds,
        totalDistanceMeters,
        description,
        trainer,
        stravaTags,
      );
      return jsonResponse({
        success: true,
        activityId: result.activityId,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("strava-push error:", err);

    // Surface user-friendly duplicate errors with 409
    if (message.includes("already been uploaded")) {
      return errorResponse(message, 409);
    }
    // Surface reconnect errors with 401
    if (message.includes("reconnect")) {
      return errorResponse(message, 401);
    }

    return errorResponse(message);
  }
});
