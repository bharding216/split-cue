/**
 * Heart rate feature analytics.
 *
 * These events measure how the feature is used and how reliable it is,
 * never the runner's physiology: each event allows only the fields listed
 * here, and none of them is a heart rate value or a heart-rate-derived metric.
 */

import { track } from './track';
import type { HrCloudConsent } from '../heartRate/hrConsent';

export type HrConsentSource = 'settings' | 'pre_run' | 'paired';

interface HrEventProps {
  /** First connection during a workout; `wait_seconds` is 0 when already connected at start. */
  hr_device_connected: { wait_seconds: number };
  hr_workout_started: { connected_at_start: boolean };
  hr_workout_completed: {
    /** Share of the workout with readings, rounded down to the nearest 10%. */
    coverage_pct: number;
    dropout_count: number;
    cloud_consent: HrCloudConsent;
  };
  hr_analysis_viewed: { is_pro: boolean; has_graph: boolean };
  hr_pro_upgrade_clicked: { source: 'run_details' };
  hr_elevation_overlay_toggled: { enabled: boolean };
  hr_connection_failed: { device_name: string | null; error: string; attempts: number };
  /** Feeds the website's "Confirmed working" monitor list. */
  hr_recording_saved: { device_name: string | null; sample_count: number };
  hr_consent_granted: { source: HrConsentSource };
  hr_consent_declined: { source: HrConsentSource };
  hr_consent_revoked: { deleted_cloud_copies: boolean };
}

export type HrEventName = keyof HrEventProps;

export function trackHr<E extends HrEventName>(event: E, props: HrEventProps[E]): void {
  track(event, props as Record<string, unknown>);
}
