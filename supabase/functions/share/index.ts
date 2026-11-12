/**
 * Share landing page — served at splitcue.app/w/<code> via the share-proxy worker.
 *
 * Renders the shared workout's name and summary (also used for iMessage /
 * social link previews) with buttons to open it in the app or get the app.
 *
 * Reads both payload formats stored in `shared_workouts.workout_data`:
 *   v1: { n, w, b, c }      — warmup/blocks/cooldown of { repeatCount, intervals }
 *   v2: { v: 2, n, b, a?, pd?, k?, s?, r? } — block model (segments and repeat groups);
 *                             `a` is set by dev/preview builds only;
 *                             `pd` is the sender's planned date (YYYY-MM-DD);
 *                             `k` is the share kind; `s` the sender's first name;
 *                             `r` their result { d: ms, m?: meters }
 *
 * When the sender's app uploaded a share card (`image_path`), it's the link
 * preview image; otherwise the site banner is. Opens by people (not link
 * preview bots) are counted with `record_share_event`.
 *
 * The store buttons carry the code through an install so the app can import
 * the workout on first launch: the Play link sets the install referrer, and
 * the App Store button copies the share URL to the clipboard.
 *
 * Must be deployed with JWT verification off; link previews and browsers
 * call it without auth.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const APP_STORE_URL = "https://apps.apple.com/us/app/pacecue-interval-timer/id6809834816";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.surmount.pacecue";
const SHARE_BASE_URL = "https://splitcue.app/w";
const DEFAULT_OG_IMAGE = "https://splitcue.app/banner.png";
const SHARE_CARD_BASE_URL = `${SUPABASE_URL}/storage/v1/object/public/share-cards`;
const IMAGE_PATH_PATTERN = /^[A-Za-z0-9]{4,16}\.png$/;
const SENDER_NAME_MAX_LENGTH = 30;
const BOT_PATTERN =
  /bot|crawl|spider|preview|facebookexternalhit|facebot|whatsapp|telegram|slack|discord|skype|linkedin|embedly|vkshare|pinterest|quora|outbrain|google-inspectiontool|bitlybot|iframely/i;

const PRODUCTION_SCHEME = "pacecue";
const VARIANT_SCHEMES: Record<string, { scheme: string; label: string }> = {
  preview: { scheme: "pacecue-preview", label: "Preview build" },
  development: { scheme: "pacecue-dev", label: "Dev build" },
};

const METERS_PER_MILE = 1609.344;
const MAX_BLOCK_DEPTH = 8;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatTime(totalSec: number): string {
  const sec = Math.round(totalSec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  return miles >= 0.1 ? `${miles.toFixed(2)} mi` : `${Math.round(meters)} m`;
}

interface Totals {
  seconds: number;
  meters: number;
  intervals: number;
}

// deno-lint-ignore no-explicit-any
type Json = any;

function asCount(n: Json): number {
  return typeof n === "number" && isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function asAmount(n: Json): number {
  return typeof n === "number" && isFinite(n) && n > 0 ? n : 0;
}

function addV2Blocks(blocks: Json, reps: number, depth: number, totals: Totals): void {
  if (!Array.isArray(blocks) || depth > MAX_BLOCK_DEPTH) return;
  for (const block of blocks) {
    if (block?.blockType === "repeat") {
      addV2Blocks(block.blocks, reps * asCount(block.repetitions), depth + 1, totals);
    } else if (block?.blockType === "segment") {
      totals.intervals += reps;
      const target = block.target ?? {};
      if (target.type === "distance") totals.meters += reps * asAmount(target.distanceMeters);
      else if (target.type === "time") totals.seconds += reps * asAmount(target.durationSeconds);
    }
  }
}

function addV1Blocks(blocks: Json, totals: Totals): void {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    const intervals = Array.isArray(block?.intervals) ? block.intervals : [];
    const reps = asCount(block?.repeatCount);
    for (const interval of intervals) {
      totals.intervals += reps;
      totals.seconds += reps * asAmount(interval?.durationSeconds);
    }
  }
}

function summarize(workout: Json): string | null {
  const totals: Totals = { seconds: 0, meters: 0, intervals: 0 };
  if (workout?.v === 2) {
    addV2Blocks(workout.b, 1, 0, totals);
  } else {
    addV1Blocks(workout?.w, totals);
    addV1Blocks(workout?.b, totals);
    addV1Blocks(workout?.c, totals);
  }
  if (totals.intervals === 0) return null;

  const parts: string[] = [];
  const amounts: string[] = [];
  if (totals.seconds > 0) amounts.push(formatTime(totals.seconds));
  if (totals.meters > 0) amounts.push(formatDistance(totals.meters));
  if (amounts.length > 0) parts.push(`${amounts.join(" + ")} total`);
  parts.push(`${totals.intervals} interval${totals.intervals !== 1 ? "s" : ""}`);
  return parts.join(" \u00b7 ");
}

function formatPlannedDate(pd: Json): string | null {
  if (typeof pd !== "string") return null;
  const match = pd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
}

function senderName(workout: Json): string | null {
  if (typeof workout?.s !== "string") return null;
  const name = workout.s.trim().slice(0, SENDER_NAME_MAX_LENGTH);
  return name || null;
}

/** "32:10 \u00b7 4.02 mi \u00b7 8:00/mi" from the sender's result, or null. */
function formatResult(workout: Json): string | null {
  const d = workout?.r?.d;
  if (typeof d !== "number" || !isFinite(d) || d <= 0) return null;
  const parts = [formatTime(d / 1000)];
  const m = workout?.r?.m;
  if (typeof m === "number" && isFinite(m) && m > 0) {
    parts.push(formatDistance(m));
    if (m >= 100) {
      const pace = d / 60000 / (m / METERS_PER_MILE);
      if (isFinite(pace) && pace > 0 && pace < 30) parts.push(`${formatTime(pace * 60)}/mi`);
    }
  }
  return parts.join(" \u00b7 ");
}

function renderPage(code: string, workout: Json | null, imagePath: string | null): string {
  const rawName = typeof workout?.n === "string" && workout.n.trim() ? workout.n.trim() : null;
  const name = rawName ? escapeHtml(rawName) : "Shared Workout";
  const plannedDate = formatPlannedDate(workout?.pd);
  const rawSender = senderName(workout);
  const sender = rawSender ? escapeHtml(rawSender) : null;
  const result = formatResult(workout);
  const isChallenge = workout?.k === "challenge";

  let summary: string | null = null;
  try {
    summary = workout ? summarize(workout) : null;
  } catch {
    summary = null;
  }
  const fallbackDesc = plannedDate
    ? "Open in SplitCue to add this workout to your calendar."
    : "Open in SplitCue to try this workout.";
  const resultDesc = result
    ? `${rawSender ?? "They"} ran it in ${result}.${isChallenge ? " Can you beat it?" : ""}`
    : null;
  const desc = escapeHtml(
    [
      resultDesc,
      plannedDate ? `Planned for ${plannedDate}` : null,
      summary ?? (resultDesc ? null : fallbackDesc),
    ]
      .filter(Boolean)
      .join(" \u00b7 "),
  );
  const title = sender
    ? isChallenge
      ? `${sender} challenged you: ${name}`
      : plannedDate
        ? `Run ${name} with ${sender}`
        : `${name} from ${sender}`
    : name;
  const ogImage = imagePath && IMAGE_PATH_PATTERN.test(imagePath)
    ? `${SHARE_CARD_BASE_URL}/${imagePath}`
    : DEFAULT_OG_IMAGE;
  const cardImage = ogImage === DEFAULT_OG_IMAGE
    ? ""
    : `<img class="card-image" src="${ogImage}" alt="${name} share card" width="1080" height="1350">`;
  const shareUrl = `${SHARE_BASE_URL}/${code}`;
  const playUrl = `${PLAY_STORE_URL}&referrer=${encodeURIComponent(`splitcue_share=${code}`)}`;

  const productionLink = `${PRODUCTION_SCHEME}://w/${code}`;
  const variant = typeof workout?.a === "string" ? VARIANT_SCHEMES[workout.a] : undefined;
  const primaryLink = variant ? `${variant.scheme}://w/${code}` : productionLink;
  const primaryLabel = variant ? `Open in SplitCue ${variant.label}` : "Open in SplitCue";
  const secondaryOpen = variant
    ? `<a class="btn btn-secondary" href="${productionLink}">Open in SplitCue</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} \u2014 SplitCue</title>
  <meta name="description" content="${desc}">
  <meta property="og:title" content="${title} \u2014 SplitCue">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="SplitCue">
  <meta property="og:url" content="${SHARE_BASE_URL}/${code}">
  <meta property="og:image" content="${ogImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title} \u2014 SplitCue">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${ogImage}">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#181818;color:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .card{background:#242424;border-radius:16px;padding:32px;max-width:380px;width:100%;text-align:center}
    h1{font-size:22px;margin-bottom:8px}
    .eyebrow{color:#4ADE80;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px}
    .card-image{display:block;width:100%;height:auto;border-radius:12px;margin-bottom:20px}
    .result{color:#f5f5f5;font-size:15px;font-weight:600;margin-bottom:8px}
    .summary{color:#aaa;font-size:14px;margin-bottom:24px}
    .btn{display:block;width:100%;padding:14px;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;text-decoration:none;margin-bottom:12px}
    .btn-primary{background:#4ADE80;color:#181818}
    .btn-secondary{background:#333;color:#f5f5f5}
    .hint{color:#888;font-size:13px;margin-top:4px}
    .footer{margin-top:20px;color:#666;font-size:12px}
  </style>
</head>
<body>
  <div class="card">
    ${cardImage}
    ${sender ? `<p class="eyebrow">${isChallenge ? `Challenge from ${sender}` : `From ${sender}`}</p>` : ""}
    <h1>${name}</h1>
    ${resultDesc ? `<p class="result">${escapeHtml(resultDesc)}</p>` : ""}
    <p class="summary">${escapeHtml([plannedDate ? `Planned for ${plannedDate}` : null, summary ?? (resultDesc ? null : fallbackDesc)].filter(Boolean).join(" \u00b7 "))}</p>
    <a class="btn btn-primary" href="${primaryLink}">${primaryLabel}</a>
    ${secondaryOpen}
    <a id="ios" class="btn btn-secondary" href="${APP_STORE_URL}" style="display:none">Download on the App Store</a>
    <a id="android" class="btn btn-secondary" href="${playUrl}" style="display:none">Get it on Google Play</a>
    <p id="ios-hint" class="hint" style="display:none">New to SplitCue? After installing, open the app and allow paste to pick up this workout.</p>
    <p class="hint">Already have SplitCue? If the workout doesn't open, update to the latest version.</p>
    <p class="footer">SplitCue \u2014 Interval running, guided by audio cues</p>
  </div>
  <script>
    (function() {
      var ua = navigator.userAgent || '';
      var isIOS = /iPhone|iPad|iPod/i.test(ua);
      var isAndroid = /Android/i.test(ua);
      var ios = document.getElementById('ios');
      if (isIOS) {
        ios.style.display = 'block';
        document.getElementById('ios-hint').style.display = 'block';
      }
      else if (isAndroid) document.getElementById('android').style.display = 'block';
      else { ios.style.display = 'block'; document.getElementById('android').style.display = 'block'; }

      // The app reads this on first launch to import the workout.
      var shareUrl = ${JSON.stringify(shareUrl)};
      function copyFallback() {
        var input = document.createElement('textarea');
        input.value = shareUrl;
        input.setAttribute('readonly', '');
        input.style.position = 'absolute';
        input.style.left = '-9999px';
        document.body.appendChild(input);
        input.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(input);
      }
      ios.addEventListener('click', function(e) {
        if (!isIOS) return;
        e.preventDefault();
        var go = function() { window.location.href = ios.href; };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).then(go, function() { copyFallback(); go(); });
        } else {
          copyFallback();
          go();
        }
      });
    })();
  </script>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code || !/^[A-Za-z0-9]{4,16}$/.test(code)) {
    return new Response("Missing or invalid code", { status: 400 });
  }

  let workout: Json | null = null;
  let imagePath: string | null = null;
  try {
    const { data, error } = await supabase
      .from("shared_workouts")
      .select("workout_data, image_path")
      .eq("code", code)
      .maybeSingle();
    if (data) {
      workout = data.workout_data;
      imagePath = typeof data.image_path === "string" ? data.image_path : null;
    } else if (error) {
      // The image column may not be migrated yet.
      const { data: fallback } = await supabase
        .from("shared_workouts")
        .select("workout_data")
        .eq("code", code)
        .maybeSingle();
      if (fallback) workout = fallback.workout_data;
    }
  } catch {
    // Serve the page with generic info
  }

  // The share-proxy worker forwards the visitor's user agent.
  const userAgent = req.headers.get("x-forwarded-user-agent") ?? req.headers.get("user-agent") ?? "";
  if (workout && userAgent && !BOT_PATTERN.test(userAgent)) {
    try {
      await supabase.rpc("record_share_event", { share_code: code, event_kind: "open" });
    } catch {
      // Counting is best effort
    }
  }

  let html: string;
  try {
    html = renderPage(code, workout, imagePath);
  } catch {
    html = renderPage(code, null, null);
  }

  return new Response(html, {
    status: workout ? 200 : 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": workout ? "public, max-age=300" : "no-store",
    },
  });
});
