/**
 * Records one ai_requests row per AI coach call so requests, responses, and what the
 * runner did with them (via `ai_request_outcome` events) can be analyzed later.
 * Logging runs after the response is sent and never fails the request.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { ChatStats } from "./openai.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_USER_TEXT = 4000;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Sent by the app next to the request body; every field is optional. */
export interface ClientMeta {
  /** Which screen made the request, e.g. "edit_sheet" or "plan_chat". */
  source?: string;
  input_method?: string;
  /** The runner's own words, without the context the app wraps around them. */
  user_text?: string;
  app_version?: string;
  environment?: string;
}

export type AiRequestStatus = "ok" | "invalid" | "error";

/** The gateway already verified the JWT (verify_jwt), so reading `sub` is enough. */
function userIdFromAuth(req: Request): string | null {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return claims.role === "authenticated" && typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

function clip(text: unknown, max: number): string | null {
  return typeof text === "string" ? text.slice(0, max) : null;
}

export function startAiLog(
  req: Request,
  opts: { functionName: string; model: string; client?: ClientMeta; request: unknown; fallbackUserText?: string },
) {
  const id = crypto.randomUUID();
  const startedAt = Date.now();
  const userId = userIdFromAuth(req);
  const client = opts.client ?? {};

  return {
    id,
    finish(result: { status: AiRequestStatus; stats: ChatStats; response?: unknown; error?: string }) {
      const row = {
        id,
        user_id: userId,
        function_name: opts.functionName,
        source: clip(client.source, 40),
        input_method: clip(client.input_method, 20),
        user_text: clip(client.user_text ?? opts.fallbackUserText, MAX_USER_TEXT),
        request: opts.request,
        response: result.response ?? null,
        status: result.status,
        error: clip(result.error, 1000),
        model: opts.model,
        attempts: result.stats.attempts,
        validation_problems: result.stats.problems,
        input_tokens: result.stats.inputTokens,
        output_tokens: result.stats.outputTokens,
        latency_ms: Date.now() - startedAt,
        app_version: clip(client.app_version, 32),
        environment: clip(client.environment, 20),
      };
      const write = Promise.resolve(adminClient.from("ai_requests").insert(row)).then(
        ({ error }) => {
          if (error) console.warn("ai_requests insert failed:", error.message);
        },
        (err) => console.warn("ai_requests insert failed:", err),
      );
      EdgeRuntime.waitUntil(write);
    },
  };
}
