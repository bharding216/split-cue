/**
 * Resilient wrapper around supabase.functions.invoke.
 *
 * Supabase intermittently returns FunctionsFetchError ("Failed to send a
 * request to the Edge Function") when the request never reaches the worker —
 * known ~1% client-side flake. Automatic retries with backoff recover most
 * cases without stranding the runner mid-flow.
 *
 * Only retries when the request almost certainly did not execute (fetch /
 * relay failures, or gateway 502/503/504/546). Application 4xx errors are
 * returned immediately.
 */

import type { FunctionInvokeOptions } from '@supabase/supabase-js';
import { supabase } from '../analytics/supabaseClient';
import { track } from '../analytics/track';
import { isTransientEdgeError, retryDelayMs } from './edgeFunctionErrors';

export { isTransientEdgeError, retryDelayMs } from './edgeFunctionErrors';

const DEFAULT_MAX_ATTEMPTS = 3;

export type InvokeEdgeFunctionOptions = FunctionInvokeOptions & {
  /** Total tries including the first. Default 3. */
  maxAttempts?: number;
};

export interface InvokeEdgeFunctionResult<T = unknown> {
  data: T | null;
  error: Error | null;
  /** 1-based attempt that produced this result. */
  attempts: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invoke a Supabase Edge Function with retries on transient transport errors.
 * Returns the same `{ data, error }` shape as supabase-js, plus `attempts`.
 */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  options?: InvokeEdgeFunctionOptions,
): Promise<InvokeEdgeFunctionResult<T>> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const { maxAttempts: _ignored, ...invokeOptions } = options ?? {};

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, error } = await supabase.functions.invoke(functionName, invokeOptions);

    if (!error) {
      return { data: data as T, error: null, attempts: attempt };
    }

    lastError = error;

    if (attempt >= maxAttempts || !isTransientEdgeError(error)) {
      return { data: (data as T) ?? null, error, attempts: attempt };
    }

    const delay = retryDelayMs(attempt - 1);
    console.warn(
      `[invokeEdgeFunction] ${functionName} attempt ${attempt}/${maxAttempts} failed (${error.message}); retrying in ${delay}ms`,
    );
    track('edge_function_retry', {
      function_name: functionName,
      attempt,
      max_attempts: maxAttempts,
      error: String(error.message ?? error).slice(0, 160),
      delay_ms: delay,
    });

    await sleep(delay);
  }

  return { data: null, error: lastError, attempts: maxAttempts };
}
