/**
 * Hands a day to the Training calendar across tabs. Route params don't reach
 * the Training stack's index screen when it's already mounted, so callers
 * leave a request here and the screen picks it up on focus.
 */

export type CalendarHighlightSource = 'suggestion' | 'reminder' | 'home' | 'workout_complete';

export interface CalendarRequest {
  date: string;
  highlightId?: string;
  /** Completed-run history ID to highlight in the day detail. */
  highlightRunId?: string;
  from?: CalendarHighlightSource;
}

let pending: CalendarRequest | null = null;

export function requestCalendarDate(
  date: string,
  highlightId?: string,
  from?: CalendarHighlightSource,
  highlightRunId?: string,
): void {
  pending = { date, highlightId, highlightRunId, from };
}

/** Returns the pending request, if any, and clears it. */
export function consumeCalendarRequest(): CalendarRequest | null {
  const request = pending;
  pending = null;
  return request;
}
