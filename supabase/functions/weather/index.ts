/**
 * weather — Supabase Edge Function
 *
 * Returns current conditions from Apple WeatherKit for a location, so a
 * finished run can record the weather it was run in. The WeatherKit signing
 * key never leaves the server; only signed-in users can call this.
 *
 * Deploy:  supabase functions deploy weather
 * Secrets: WEATHERKIT_TEAM_ID, WEATHERKIT_SERVICE_ID, WEATHERKIT_KEY_ID,
 *          WEATHERKIT_PRIVATE_KEY (contents of the AuthKey_XXXX.p8 file)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TEAM_ID = Deno.env.get("WEATHERKIT_TEAM_ID")!;
const SERVICE_ID = Deno.env.get("WEATHERKIT_SERVICE_ID")!;
const KEY_ID = Deno.env.get("WEATHERKIT_KEY_ID")!;
const PRIVATE_KEY = Deno.env.get("WEATHERKIT_PRIVATE_KEY")!;
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

// ── Developer token ──────────────────────────────────────────

const TOKEN_TTL_SEC = 60 * 60;

let cachedToken: { value: string; expiresAt: number } | null = null;
let signingKey: Promise<CryptoKey> | null = null;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlJson(value: object): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function importSigningKey(): Promise<CryptoKey> {
  const pem = PRIVATE_KEY.replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** ES256 JWT in the shape WeatherKit requires (no extra claims allowed). */
async function getDeveloperToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - now > 60) return cachedToken.value;

  signingKey ??= importSigningKey();
  const header = { alg: "ES256", kid: KEY_ID, id: `${TEAM_ID}.${SERVICE_ID}` };
  const claims = { iss: TEAM_ID, iat: now, exp: now + TOKEN_TTL_SEC, sub: SERVICE_ID };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  // WebCrypto's ECDSA output is raw r||s, which is the JWS encoding.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await signingKey,
    new TextEncoder().encode(unsigned),
  );
  const value = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  cachedToken = { value, expiresAt: now + TOKEN_TTL_SEC };
  return value;
}

// ── Main handler ─────────────────────────────────────────────

interface WeatherRequest {
  lat: number;
  lng: number;
}

interface CurrentWeatherData {
  asOf: string;
  conditionCode: string;
  daylight: boolean;
  humidity: number;
  precipitationIntensity: number;
  temperature: number;
  temperatureApparent: number;
  uvIndex: number;
  windGust?: number;
  windSpeed: number;
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
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

    const { lat, lng } = (await req.json()) as WeatherRequest;
    if (!isCoordinate(lat, 90) || !isCoordinate(lng, 180)) {
      return errorResponse("lat and lng are required", 400);
    }

    const token = await getDeveloperToken();
    const url =
      `https://weatherkit.apple.com/api/v1/weather/en/${lat.toFixed(4)}/${lng.toFixed(4)}` +
      `?dataSets=currentWeather`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!res.ok) {
      console.error("WeatherKit request failed:", res.status, await res.text());
      return errorResponse(`WeatherKit request failed: ${res.status}`, 502);
    }

    const current = (await res.json()).currentWeather as CurrentWeatherData | undefined;
    if (!current) {
      return errorResponse("No current weather for this location", 404);
    }

    return jsonResponse({
      weather: {
        conditionCode: current.conditionCode,
        temperatureC: current.temperature,
        feelsLikeC: current.temperatureApparent,
        humidity: current.humidity,
        windSpeedKph: current.windSpeed,
        windGustKph: current.windGust,
        precipitationMmPerHour: current.precipitationIntensity,
        uvIndex: current.uvIndex,
        daylight: current.daylight,
        observedAt: Date.parse(current.asOf),
      },
    });
  } catch (err: unknown) {
    console.error("weather error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal server error");
  }
});
