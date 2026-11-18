/**
 * GPS quality summary attached to workout analytics events.
 */

import type { GpsSample } from '../pace/paceTypes';

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return Math.round(sorted[index] * 10) / 10;
}

export interface GpsSampleCounts {
  foreground: number;
  background: number;
}

/**
 * Accuracy stats for the kept GPS track. Samples worse than
 * MAX_ACCURACY_METERS are already dropped from the track, so a low
 * sample count is the signal for poor reception.
 *
 * When `sampleCounts` is supplied the foreground/background breakdown and
 * an expected-sample estimate are included so the admin dashboard can flag
 * runs with anomalously low sample ratios.
 */
export function gpsQuality(
  track: GpsSample[],
  elapsedMs?: number,
  sampleCounts?: GpsSampleCounts,
): Record<string, number | null> {
  if (track.length === 0) {
    return {
      gps_sample_count: 0,
      gps_accuracy_median_m: null,
      gps_accuracy_p90_m: null,
      gps_foreground_samples: sampleCounts?.foreground ?? null,
      gps_background_samples: sampleCounts?.background ?? null,
      gps_expected_samples: elapsedMs != null ? Math.round(elapsedMs / 1000) : null,
    };
  }
  const sorted = track.map((s) => s.accuracy).sort((a, b) => a - b);
  return {
    gps_sample_count: track.length,
    gps_accuracy_median_m: percentile(sorted, 0.5),
    gps_accuracy_p90_m: percentile(sorted, 0.9),
    gps_foreground_samples: sampleCounts?.foreground ?? null,
    gps_background_samples: sampleCounts?.background ?? null,
    gps_expected_samples: elapsedMs != null ? Math.round(elapsedMs / 1000) : null,
  };
}
