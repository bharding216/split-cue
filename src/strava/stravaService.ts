/**
 * Strava integration service.
 *
 * Handles OAuth connection, disconnection, status checks, GPX generation,
 * and workout upload. All Strava API calls go through Supabase Edge
 * Functions (strava-auth, strava-push) so the client secret stays
 * server-side.
 */

import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { supabase } from '../analytics/supabaseClient';
import { track } from '../analytics/track';
import { updateHistoryEntry, loadSettings, saveSettings } from '../workout/workoutStorage';
import type { CompletedWorkout, RoutePoint } from '../workout/workoutTypes';

// ── Redirect URI ─────────────────────────────────────────────
// Strava's callback domain field only accepts a bare domain, so we
// redirect through splitcue.app which then bounces into the app via
// the custom URL scheme.

const configScheme = Constants.expoConfig?.scheme;
const SCHEME = (Array.isArray(configScheme) ? configScheme[0] : configScheme) ?? 'pacecue';

/** The HTTPS URL Strava redirects to (must match the registered callback domain). */
const STRAVA_REDIRECT_URI = 'https://splitcue.app/strava/callback';

/** The custom-scheme URI the Cloudflare Worker bounces into (what openAuthSessionAsync listens for). */
const APP_REDIRECT_URI = `${SCHEME}://strava/callback`;

// ── Connection status ────────────────────────────────────────

export interface StravaConnection {
  connected: boolean;
  athleteName: string | null;
  stravaAthleteId: number | null;
}

/**
 * Check whether the current user has a connected Strava account.
 * Returns { connected: false } if not authenticated or not connected.
 */
export async function getStravaStatus(): Promise<StravaConnection> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { connected: false, athleteName: null, stravaAthleteId: null };
    }

    const { data, error } = await supabase
      .from('strava_connections')
      .select('athlete_name, strava_athlete_id')
      .single();

    if (error || !data) {
      return { connected: false, athleteName: null, stravaAthleteId: null };
    }

    return {
      connected: true,
      athleteName: data.athlete_name,
      stravaAthleteId: data.strava_athlete_id,
    };
  } catch {
    return { connected: false, athleteName: null, stravaAthleteId: null };
  }
}

// ── OAuth connect ────────────────────────────────────────────

export interface ConnectResult {
  success: boolean;
  athleteName?: string;
  error?: string;
}

/**
 * Initiate the Strava OAuth flow.
 *
 * 1. Asks the Edge Function for the authorize URL
 * 2. Opens an in-app browser for the user to approve
 * 3. Captures the redirect with the authorization code
 * 4. Sends the code back to the Edge Function for token exchange
 */
export async function connectStrava(): Promise<ConnectResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Please sign in first' };
    }

    // Step 1: Get the authorize URL from the Edge Function.
    // We call the function URL directly (instead of supabase.functions.invoke)
    // because we need to pass redirect_uri as a query param on a GET request.
    const SUPABASE_URL = 'https://oakhqqrxsavmoeqlzcny.supabase.co';
    const SUPABASE_ANON_KEY =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ha2hxcXJ4c2F2bW9lcWx6Y255Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTgyMDYsImV4cCI6MjEwNjg3NDIwNn0.kLmkWC2SgnSfaGY20s4WXo2n1BauLboEZZQDYbrKs4M';

    const fnUrl = `${SUPABASE_URL}/functions/v1/strava-auth?redirect_uri=${encodeURIComponent(STRAVA_REDIRECT_URI)}`;
    const getRes = await fetch(fnUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (!getRes.ok) {
      const errBody = await getRes.json().catch(() => ({}));
      return { success: false, error: errBody.error ?? 'Failed to start Strava connection' };
    }

    const { url: authorizeUrl } = await getRes.json();
    if (!authorizeUrl) {
      return { success: false, error: 'No authorize URL returned' };
    }

    // Step 2: Open the browser for user authorization.
    // Strava redirects to splitcue.app, which bounces into the app
    // via the custom scheme. We listen for the custom-scheme URL.
    const result = await WebBrowser.openAuthSessionAsync(
      authorizeUrl,
      APP_REDIRECT_URI,
    );

    if (result.type !== 'success' || !result.url) {
      // User cancelled or browser failed — not an error
      return { success: false };
    }

    // Step 3: Extract the authorization code from the redirect URL
    const redirectUrl = new URL(result.url);
    const code = redirectUrl.searchParams.get('code');
    if (!code) {
      return { success: false, error: 'No authorization code received from Strava' };
    }

    // Step 4: Exchange the code for tokens via the Edge Function
    const exchangeRes = await fetch(`${SUPABASE_URL}/functions/v1/strava-auth`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    const exchangeBody = await exchangeRes.json().catch(() => ({}));

    if (!exchangeRes.ok) {
      return {
        success: false,
        error: exchangeBody.error ?? `Strava connection failed (${exchangeRes.status})`,
      };
    }

    track('strava_connected', {
      strava_athlete_id: exchangeBody.stravaAthleteId,
    });

    return {
      success: true,
      athleteName: exchangeBody.athleteName,
    };
  } catch (e: any) {
    console.warn('Strava connect error:', e);
    return { success: false, error: e.message ?? 'Connection failed' };
  }
}

// ── Disconnect ───────────────────────────────────────────────

/**
 * Disconnect the user's Strava account.
 * Revokes the token and removes the DB record via the Edge Function.
 */
export async function disconnectStrava(): Promise<{ error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Not signed in' };

    const SUPABASE_URL = 'https://oakhqqrxsavmoeqlzcny.supabase.co';
    const SUPABASE_ANON_KEY =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ha2hxcXJ4c2F2bW9lcWx6Y255Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTgyMDYsImV4cCI6MjEwNjg3NDIwNn0.kLmkWC2SgnSfaGY20s4WXo2n1BauLboEZZQDYbrKs4M';

    const res = await fetch(`${SUPABASE_URL}/functions/v1/strava-auth`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (!res.ok) {
      return { error: 'Failed to disconnect Strava' };
    }

    track('strava_disconnected');
    return {};
  } catch (e: any) {
    return { error: e.message ?? 'Disconnect failed' };
  }
}

// ── GPX builder ──────────────────────────────────────────────

/**
 * Build a GPX 1.1 XML string from SplitCue route points.
 *
 * The RoutePoint type already stores lat, lng, alt (nullable), and ts
 * (epoch ms), which maps perfectly to GPX <trkpt> elements.
 */
export function buildGpx(
  route: RoutePoint[],
  name: string,
  startTime: number,
): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx xmlns="http://www.topografix.com/GPX/1/1"',
    '     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"',
    '     version="1.1"',
    '     creator="SplitCue">',
    '  <metadata>',
    `    <name>${escapeXml(name)}</name>`,
    `    <time>${new Date(startTime).toISOString()}</time>`,
    '  </metadata>',
    '  <trk>',
    `    <name>${escapeXml(name)}</name>`,
    '    <type>running</type>',
    '    <trkseg>',
  ];

  for (const pt of route) {
    lines.push(`      <trkpt lat="${pt.lat}" lon="${pt.lng}">`);
    if (pt.alt != null) {
      lines.push(`        <ele>${pt.alt.toFixed(1)}</ele>`);
    }
    lines.push(`        <time>${new Date(pt.ts).toISOString()}</time>`);
    lines.push('      </trkpt>');
  }

  lines.push('    </trkseg>');
  lines.push('  </trk>');
  lines.push('</gpx>');

  return lines.join('\n');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Auto-upload setting ──────────────────────────────────────

export async function setStravaAutoUpload(
  enabled: boolean,
  source: 'settings' | 'connect_prompt',
): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({ ...settings, stravaAutoUpload: enabled });
  track('strava_auto_upload_toggled', { enabled, source });
}

// ── Push workout ─────────────────────────────────────────────

export interface PushResult {
  success: boolean;
  activityId?: number;
  activityUrl?: string;
  error?: string;
}

export type PushTrigger = 'auto' | 'manual';

const pendingUploads = new Map<string, Promise<PushResult>>();

const uploadedListeners = new Set<(entryId: string, activityId: number) => void>();

/** Called after a run's Strava activity ID is saved. Returns an unsubscribe function. */
export function onStravaUploaded(
  listener: (entryId: string, activityId: number) => void,
): () => void {
  uploadedListeners.add(listener);
  return () => uploadedListeners.delete(listener);
}

/** The upload already running for this history entry, if any. */
export function getPendingStravaUpload(entryId: string): Promise<PushResult> | undefined {
  return pendingUploads.get(entryId);
}

export function stravaActivityUrl(activityId: number): string {
  return `https://www.strava.com/activities/${activityId}`;
}

/**
 * Push a completed workout to the user's Strava account.
 *
 * Builds a GPX from the route (if available), then sends everything
 * to the strava-push Edge Function which handles the Strava API call.
 * Concurrent calls for the same entry share one upload, and the Strava
 * activity ID is saved on the history entry once known.
 */
export function pushWorkoutToStrava(
  completed: CompletedWorkout,
  trigger: PushTrigger = 'manual',
): Promise<PushResult> {
  const pending = pendingUploads.get(completed.id);
  if (pending) return pending;

  const upload = uploadWorkout(completed, trigger).finally(() => {
    pendingUploads.delete(completed.id);
  });
  pendingUploads.set(completed.id, upload);
  return upload;
}

async function uploadWorkout(
  completed: CompletedWorkout,
  trigger: PushTrigger,
): Promise<PushResult> {
  try {
    let gpx: string | undefined;

    if (completed.route && completed.route.length >= 2) {
      const startTime = completed.completedAt - completed.totalDurationMs;
      gpx = buildGpx(completed.route, completed.workoutName, startTime);
    }

    const { data, error } = await supabase.functions.invoke('strava-push', {
      body: {
        workoutName: completed.workoutName,
        completedAt: completed.completedAt,
        totalDurationMs: completed.totalDurationMs,
        totalDistanceMeters: completed.totalDistanceMeters,
        gpx,
        tags: completed.tags,
        notes: completed.notes,
      },
    });

    if (error) {
      // Try to extract the error message from the Edge Function response
      let message = 'Failed to push workout to Strava';
      if (typeof error === 'object' && error !== null) {
        const ctx = error as any;
        if (ctx.context?.body) {
          try {
            const body = JSON.parse(ctx.context.body);
            if (body.error) message = body.error;
          } catch {}
        } else if (ctx.message) {
          message = ctx.message;
        }
      }
      return { success: false, error: message };
    }

    const activityId: number | undefined = data?.activityId;
    const activityUrl = activityId ? stravaActivityUrl(activityId) : undefined;

    if (activityId) {
      await updateHistoryEntry(completed.id, (entry) => ({
        ...entry,
        stravaActivityId: activityId,
      })).catch(() => {});
      uploadedListeners.forEach((listener) => listener(completed.id, activityId));
    }

    track('strava_workout_pushed', {
      workout_id: completed.workoutId,
      has_gpx: !!gpx,
      activity_id: activityId,
      trigger,
    });

    return { success: true, activityId, activityUrl };
  } catch (e: any) {
    console.warn('Strava push error:', e);
    return { success: false, error: e.message ?? 'Push failed' };
  }
}
