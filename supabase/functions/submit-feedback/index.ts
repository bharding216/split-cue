/**
 * submit-feedback — accepts in-app feedback, stores it, and emails the dev.
 *
 * POST body:
 *   { category: 'bug' | 'idea' | 'other', message: string,
 *     email?: string, open_to_followup: boolean,
 *     app_version?: string, platform?: string, os_version?: string,
 *     device_model?: string, screen?: string }
 *
 * Sends a notification email to the developer via Resend so they can read
 * (and reply to) feedback without opening a dashboard.
 *
 * Env vars:
 *   RESEND_API_KEY  — Resend API key
 *   FEEDBACK_TO     — developer email (defaults to brandon@getsurmount.com)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FEEDBACK_TO = Deno.env.get("FEEDBACK_TO") ?? "brandon@getsurmount.com";
const FEEDBACK_FROM = "SplitCue Feedback <feedback@splitcue.app>";

const CATEGORIES: Record<string, string> = {
  bug: "🐛 Bug Report",
  idea: "💡 Feature Idea",
  other: "💬 Other Feedback",
};

const MAX_MESSAGE = 5000;

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const category = String(body.category ?? "");
  const message = String(body.message ?? "").trim();
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
  const openToFollowup = Boolean(body.open_to_followup);
  const appVersion = typeof body.app_version === "string" ? body.app_version : null;
  const platform = typeof body.platform === "string" ? body.platform : null;
  const osVersion = typeof body.os_version === "string" ? body.os_version : null;
  const deviceModel = typeof body.device_model === "string" ? body.device_model : null;
  const screen = typeof body.screen === "string" ? body.screen : null;

  if (!["bug", "idea", "other"].includes(category)) {
    return new Response(JSON.stringify({ error: "Invalid category" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!message || message.length > MAX_MESSAGE) {
    return new Response(JSON.stringify({ error: "Message is required (max 5000 chars)" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Resolve the authenticated user, if any.
  const authHeader = req.headers.get("authorization") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  // Insert into feedback table using service role so RLS doesn't block.
  const serviceClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error: insertError } = await serviceClient.from("feedback").insert({
    user_id: userId,
    category,
    message,
    email,
    open_to_followup: openToFollowup,
    app_version: appVersion,
    platform,
    os_version: osVersion,
    device_model: deviceModel,
    screen,
  });

  if (insertError) {
    console.error("feedback insert error:", insertError);
    return new Response(JSON.stringify({ error: "Failed to save feedback" }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Send email notification via Resend.
  if (RESEND_API_KEY) {
    try {
      const categoryLabel = CATEGORIES[category] ?? category;
      const replyTo = email && openToFollowup ? email : undefined;
      const deviceInfo = [
        appVersion ? `App: SplitCue v${appVersion}` : null,
        platform ? `Platform: ${platform}` : null,
        osVersion ? `OS: ${osVersion}` : null,
        deviceModel ? `Device: ${deviceModel}` : null,
        screen ? `Screen: ${screen}` : null,
        userId ? `User ID: ${userId}` : null,
      ].filter(Boolean).join("\n");

      const textBody = [
        `${categoryLabel}`,
        "",
        message,
        "",
        openToFollowup && email ? `✅ Open to follow-up: ${email}` : "❌ Not open to follow-up",
        "",
        "— Device Info —",
        deviceInfo || "(none)",
      ].join("\n");

      const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
  <h2 style="color: #4ADE80; margin-bottom: 4px;">${categoryLabel}</h2>
  <p style="color: #666; font-size: 13px; margin-top: 0;">From SplitCue in-app feedback</p>
  <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0; white-space: pre-wrap;">${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
  </div>
  ${openToFollowup && email
    ? `<p style="color: #22C55E;">✅ Open to follow-up — <strong>${email.replace(/</g, "&lt;")}</strong></p>
       <p style="font-size: 13px; color: #888;">Just reply to this email to respond.</p>`
    : `<p style="color: #888;">❌ Not open to follow-up</p>`
  }
  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
  <p style="font-size: 12px; color: #999; white-space: pre-line;">${deviceInfo.replace(/</g, "&lt;") || "(no device info)"}</p>
</div>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FEEDBACK_FROM,
          to: [FEEDBACK_TO],
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject: `${categoryLabel} — SplitCue Feedback`,
          text: textBody,
          html: htmlBody,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Resend error:", res.status, errText);
      }
    } catch (err) {
      console.error("Email notification failed:", err);
    }
  } else {
    console.warn("RESEND_API_KEY not set — skipping email notification");
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
