/**
 * voice-clips — Supabase Edge Function
 *
 * Returns public URLs for pre-generated voice cue clips. Each clip is
 * generated once per voice with ElevenLabs and cached in the public
 * `voice-clips` Storage bucket, so every later request for the same
 * phrase is a cache hit shared across all users.
 *
 * Request:  { voiceId: "coach_1", clips: [{ text, previousText?, nextText? }], clipFormat?: "stitched" }
 * Response: { clips: [{ key, url }] }   (url is null when generation failed)
 *
 * Deploy:  supabase functions deploy voice-clips
 * Secrets: supabase secrets set ELEVENLABS_API_KEY=...
 *          supabase secrets set ELEVENLABS_VOICE_COACH_1=<elevenlabs voice id>   (optional override)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKET = "voice-clips";
const MODEL_ID = "eleven_multilingual_v2";
/** 64 kbps keeps speech clear while halving the size of clips bundled with the app. */
const OUTPUT_FORMAT = "mp3_44100_64";
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
/** Bump to regenerate every clip after changing the model or voice settings. */
const SETTINGS_VERSION = "1";

const MAX_CLIPS = 50;
const MAX_TEXT_LENGTH = 300;
/** ElevenLabs caps concurrent requests per plan (3 on the current plan); leave room for overlapping calls. */
const CONCURRENCY = 2;
const MAX_ATTEMPTS = 4;
/**
 * iOS builds before this speak each cue as one whole sentence, so nearly
 * every clip they request is unique to a workout. They get cached clips
 * only; anything missing falls back to device TTS on the phone. Older
 * builds running an OTA update with stitched cues send clipFormat
 * "stitched" and are treated like current builds.
 */
const MIN_GENERATING_IOS_BUILD = 19;

/** App voice ids mapped to ElevenLabs voice ids. */
const VOICES: Record<string, string> = {
  coach_1: Deno.env.get("ELEVENLABS_VOICE_COACH_1") ?? "sXcl1NoQHcU7NRh6Na5D",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ClipRequest {
  text: string;
  previousText?: string;
  nextText?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Must match normalizeClipText in src/audio/premiumVoice.ts. */
function normalize(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Must match clipKey in src/audio/premiumVoice.ts. */
function clipKey(clip: ClipRequest): string {
  const text = normalize(clip.text);
  const prev = normalize(clip.previousText);
  const next = normalize(clip.nextText);
  return prev || next ? `${text}|${prev}|${next}` : text;
}

function isLegacyIosBuild(req: Request): boolean {
  const match = /^SplitCue\/(\d+)\b/.exec(req.headers.get("user-agent") ?? "");
  return match != null && Number(match[1]) < MIN_GENERATING_IOS_BUILD;
}

/** Whole-sentence cues from legacy clients (including Android, whose user agent has no build). */
function isMultiSentence(text: string): boolean {
  return /[.!?] \S/.test(normalize(text));
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function generate(elevenVoiceId: string, clip: ClipRequest): Promise<Uint8Array> {
  const body: Record<string, unknown> = {
    text: normalize(clip.text),
    model_id: MODEL_ID,
    voice_settings: VOICE_SETTINGS,
  };
  if (normalize(clip.previousText)) body.previous_text = normalize(clip.previousText);
  if (normalize(clip.nextText)) body.next_text = normalize(clip.nextText);

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) return new Uint8Array(await res.arrayBuffer());

    const detail = await res.text();
    if (res.status !== 429 || attempt >= MAX_ATTEMPTS) {
      throw new Error(`ElevenLabs ${res.status}: ${detail}`);
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1) + Math.random() * 250));
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!ELEVENLABS_API_KEY) {
      return json({ error: "ElevenLabs API key not configured" }, 500);
    }

    const { voiceId, clips, clipFormat } = await req.json();
    const elevenVoiceId = VOICES[voiceId];
    if (!elevenVoiceId) {
      return json({ error: "Unknown voiceId" }, 400);
    }
    if (!Array.isArray(clips) || clips.length === 0 || clips.length > MAX_CLIPS) {
      return json({ error: `clips must contain 1-${MAX_CLIPS} items` }, 400);
    }
    for (const c of clips as ClipRequest[]) {
      const lengths = [c?.text, c?.previousText, c?.nextText].map((t) => normalize(t).length);
      if (typeof c?.text !== "string" || lengths[0] === 0 || lengths.some((l) => l > MAX_TEXT_LENGTH)) {
        return json({ error: `Each clip needs text of 1-${MAX_TEXT_LENGTH} characters` }, 400);
      }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const storage = supabase.storage.from(BUCKET);
    const legacyClient = clipFormat !== "stitched" && isLegacyIosBuild(req);

    const results = await mapLimit(clips as ClipRequest[], CONCURRENCY, async (clip) => {
      const key = clipKey(clip);
      const hash = await sha256(
        [voiceId, elevenVoiceId, MODEL_ID, OUTPUT_FORMAT, SETTINGS_VERSION, key].join("|"),
      );
      const path = `${voiceId}/${hash}.mp3`;
      const url = storage.getPublicUrl(path).data.publicUrl;

      try {
        const { data: existing } = await storage.list(voiceId, { limit: 1, search: `${hash}.mp3` });
        if (existing && existing.length > 0) return { key, url };
        if (legacyClient || isMultiSentence(clip.text)) return { key, url: null };

        const audio = await generate(elevenVoiceId, clip);
        const { error } = await storage.upload(path, audio, {
          contentType: "audio/mpeg",
          cacheControl: "31536000",
          upsert: true,
        });
        if (error) throw error;
        return { key, url };
      } catch (err) {
        console.error(`voice-clips: failed for "${key}":`, err);
        return { key, url: null };
      }
    });

    return json({ clips: results });
  } catch (err) {
    console.error("voice-clips error:", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
