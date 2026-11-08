/**
 * transcribe-audio — Supabase Edge Function
 *
 * Accepts a base64-encoded audio file and transcribes it
 * using OpenAI's gpt-transcribe model. Returns the transcribed text.
 *
 * Deploy:  supabase functions deploy transcribe-audio
 * Secrets: supabase secrets set OPENAI_API_KEY=sk-...
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { MODELS } from "../_shared/openai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

/** Running terms the model should recognize. Single-line, no `<` or `>` (the API rejects those). */
const RUNNING_KEYWORDS = [
  "tempo", "fartlek", "intervals", "strides", "long run", "easy run", "recovery run",
  "threshold", "VO2 max", "negative split", "progression run", "time trial", "taper",
  "warmup", "cooldown", "400s", "800s", "mile repeats", "5K", "10K", "half marathon",
  "marathon", "PR", "per mile",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { audio_base64, mime_type = "audio/m4a" } = body;

    if (!audio_base64) {
      return new Response(
        JSON.stringify({ error: "audio_base64 is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Decode base64 to binary
    const binaryString = atob(audio_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determine file extension from mime type
    const extMap: Record<string, string> = {
      "audio/m4a": "m4a",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/flac": "flac",
    };
    const ext = extMap[mime_type] || "m4a";

    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: mime_type }), `recording.${ext}`);
    formData.append("model", MODELS.transcribe);
    formData.append("languages[]", "en");
    for (const keyword of RUNNING_KEYWORDS) formData.append("keywords[]", keyword);
    formData.append("prompt", "A runner describing a workout or changes to their training plan.");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Transcription API error:", errorBody);
      return new Response(
        JSON.stringify({ error: "Transcription failed" }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();

    return new Response(
      JSON.stringify({ text: result.text }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("transcribe-audio error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
