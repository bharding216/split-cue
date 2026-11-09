/**
 * Links AI coach responses to what the runner did with them.
 *
 * The edge functions log each request to `ai_requests` and return its `request_id`.
 * The app reports the outcome as an `ai_request_outcome` event, and the
 * `ai_request_outcomes` view joins the two.
 */

import { useCallback, useRef } from 'react';
import { appInfo, track } from './track';

export type AiSource = 'edit_sheet' | 'plan_adjust_sheet' | 'plan_chat' | 'workout_builder';
export type AiInputMethod = 'voice' | 'text' | 'chip';

export type AiOutcome =
  | 'applied'
  | 'edited_and_applied'
  | 'partially_applied'
  | 'saved_to_library'
  | 'discarded'
  | 'retried'
  | 'closed';

/** Sent with the request so the server can log the runner's own words apart from the added context. */
export interface AiClientMeta {
  source: AiSource;
  input_method: AiInputMethod;
  user_text: string;
  app_version: string;
  environment: string;
}

export function aiClientMeta(source: AiSource, inputMethod: AiInputMethod, userText: string): AiClientMeta {
  const { appVersion, environment } = appInfo();
  return { source, input_method: inputMethod, user_text: userText, app_version: appVersion, environment };
}

export function trackAiOutcome(
  requestId: string | undefined,
  outcome: AiOutcome,
  detail?: Record<string, unknown>,
): void {
  if (!requestId) return;
  track('ai_request_outcome', { request_id: requestId, outcome, ...detail });
}

/**
 * For screens that show one AI response at a time. Reports the first final outcome
 * for the current response and ignores later ones (e.g. "closed" after "applied").
 */
export function useAiOutcome() {
  const current = useRef<{ id: string; reported: boolean } | null>(null);

  const begin = useCallback((requestId: string | undefined) => {
    current.current = requestId ? { id: requestId, reported: false } : null;
  }, []);

  const report = useCallback((outcome: AiOutcome, detail?: Record<string, unknown>) => {
    const entry = current.current;
    if (!entry || entry.reported) return;
    entry.reported = true;
    trackAiOutcome(entry.id, outcome, detail);
  }, []);

  /** Reports without closing out the response, for steps like saving to the library. */
  const note = useCallback((outcome: AiOutcome, detail?: Record<string, unknown>) => {
    const entry = current.current;
    if (entry && !entry.reported) trackAiOutcome(entry.id, outcome, detail);
  }, []);

  return { begin, report, note };
}
