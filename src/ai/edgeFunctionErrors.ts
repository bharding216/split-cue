/**
 * Pure helpers for classifying / backing off transient Edge Function failures.
 * Kept free of the Supabase client so Node unit tests can import them.
 */

import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

const RETRYABLE_HTTP_STATUS = new Set([502, 503, 504, 546]);

/** True when a retry is likely to help and unlikely to double-execute. */
export function isTransientEdgeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return true;
  }

  if (error instanceof FunctionsHttpError) {
    const status = readHttpStatus(error);
    return status != null && RETRYABLE_HTTP_STATUS.has(status);
  }

  const message = String((error as { message?: string }).message ?? '');
  return /failed to send a request to the edge function/i.test(message)
    || /network request failed/i.test(message)
    || /fetch failed/i.test(message)
    || /timeout/i.test(message);
}

function readHttpStatus(error: FunctionsHttpError): number | null {
  const context = error.context as { status?: number } | undefined;
  return typeof context?.status === 'number' ? context.status : null;
}

/** Exponential backoff: 800ms, 1600ms, 3200ms… capped at 5s, plus light jitter. */
export function retryDelayMs(attemptIndex: number, random: () => number = Math.random): number {
  const base = Math.min(800 * 2 ** attemptIndex, 5000);
  const jitter = Math.floor(random() * 250);
  return base + jitter;
}
