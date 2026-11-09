/**
 * Shared OpenAI Chat Completions helper for SplitCue edge functions.
 *
 * Every JSON call uses Structured Outputs (strict json_schema) so the response
 * always matches the expected shape, then runs a domain validator. If the
 * validator finds problems, the model gets one chance to fix them before the
 * caller decides how to handle anything that remains.
 */

/**
 * Model choices. GPT-6 reasoning models don't accept `temperature`; quality
 * vs. latency is tuned per call with `reasoningEffort` instead.
 */
export const MODELS = {
  /** Plans and workouts runners actually follow. */
  coach: "gpt-6.1-sol",
  /** Short, frequent, lower-stakes calls (post-run analysis). */
  fast: "gpt-6-luna",
  transcribe: "gpt-transcribe",
} as const;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface JsonCallOptions<T> {
  /** Used in logs and as the json_schema name (a-z, 0-9, _ or -). */
  name: string;
  model: string;
  messages: ChatMessage[];
  schema: Record<string, unknown>;
  reasoningEffort: ReasoningEffort;
  /** Includes reasoning tokens, so leave generous headroom over the visible output. */
  maxCompletionTokens: number;
  /** Returns problems for the model to fix; an empty array means the output is acceptable. */
  validate?: (data: T) => string[];
  /** Filled in as the call runs, so callers can log it even when the call throws. */
  stats?: ChatStats;
}

export interface ChatStats {
  attempts: number;
  /** Validation problems from each attempt that had any. */
  problems: string[][];
  inputTokens: number;
  outputTokens: number;
}

export function newChatStats(): ChatStats {
  return { attempts: 0, problems: [], inputTokens: 0, outputTokens: 0 };
}

export interface JsonCallResult<T> {
  data: T;
  /** Problems still present after the retry. Empty when validation passed. */
  problems: string[];
}

const MAX_PROBLEMS_IN_RETRY = 15;

export async function chatJson<T>(opts: JsonCallOptions<T>): Promise<JsonCallResult<T>> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const messages = [...opts.messages];
  let last: JsonCallResult<T> | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const choice = await requestCompletion(apiKey, opts, messages);
    const content: string | undefined = choice?.message?.content ?? undefined;

    let data: T | undefined;
    if (content && choice.finish_reason !== "length") {
      try {
        data = JSON.parse(content) as T;
      } catch {
        data = undefined;
      }
    }

    if (data === undefined || !content) {
      console.warn(`[${opts.name}] attempt ${attempt}: unusable response`, {
        finish_reason: choice?.finish_reason,
        refusal: choice?.message?.refusal ?? null,
      });
      if (attempt === 2) throw new Error("The coach couldn't finish that request. Please try again.");
      continue;
    }

    const problems = opts.validate?.(data) ?? [];
    last = { data, problems };
    if (problems.length === 0) return last;
    opts.stats?.problems.push(problems);

    console.warn(`[${opts.name}] attempt ${attempt}: ${problems.length} problem(s)`, problems);
    if (attempt === 2) break;

    const listed = problems.slice(0, MAX_PROBLEMS_IN_RETRY).map((p) => `- ${p}`).join("\n");
    messages.push(
      { role: "assistant", content },
      {
        role: "user",
        content: `Your response has these problems:\n${listed}\n\nFix every problem and return the complete corrected JSON. Keep everything else the same.`,
      },
    );
  }

  return last!;
}

async function requestCompletion<T>(
  apiKey: string,
  opts: JsonCallOptions<T>,
  messages: ChatMessage[],
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const body = JSON.stringify({
    model: opts.model,
    messages,
    reasoning_effort: opts.reasoningEffort,
    max_completion_tokens: opts.maxCompletionTokens,
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.name, schema: opts.schema, strict: true },
    },
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body,
    });

    if (response.ok) {
      const completion = await response.json();
      if (opts.stats) {
        opts.stats.attempts += 1;
        opts.stats.inputTokens += completion.usage?.prompt_tokens ?? 0;
        opts.stats.outputTokens += completion.usage?.completion_tokens ?? 0;
      }
      return completion.choices?.[0];
    }

    const errorText = await response.text();
    console.error(`[${opts.name}] OpenAI error:`, response.status, errorText);
    const transient = response.status === 429 || response.status >= 500;
    if (!transient || attempt === 2) throw new Error(`OpenAI API error: ${response.status}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("unreachable");
}

/** Recursively drop null-valued keys so strict-schema output matches the app's optional fields. */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripNulls) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== null) out[k] = stripNulls(v);
    }
    return out as T;
  }
  return value;
}
