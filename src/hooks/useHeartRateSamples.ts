import { useMemo } from 'react';
import { loadHeartRateSamples } from '../heartRate/hrSampleStore';
import type { HrSample } from '../heartRate/hrTypes';

/** The run's heart rate readings stored on this device, or null when there are none. */
export function useHeartRateSamples(historyId: string | null | undefined): HrSample[] | null {
  return useMemo(() => (historyId ? loadHeartRateSamples(historyId) : null), [historyId]);
}
