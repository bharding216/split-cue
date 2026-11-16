/**
 * Finger scrubbing for charts: dragging sideways reports the x position
 * under the finger, and lifting clears it. Vertical drags fail the gesture
 * so the page still scrolls.
 */

import { useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

export function useChartScrub(width: number) {
  const [scrubX, setScrubX] = useState<number | null>(null);

  const gesture = useMemo(() => {
    const clamp = (x: number) => Math.max(0, Math.min(width, x));
    return Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-4, 4])
      .failOffsetY([-12, 12])
      .onStart((e) => {
        Haptics.selectionAsync().catch(() => {});
        setScrubX(clamp(e.x));
      })
      .onUpdate((e) => setScrubX(clamp(e.x)))
      .onFinalize(() => setScrubX(null));
  }, [width]);

  return { gesture, scrubX };
}

/** Index of the item whose `key` is closest to `value`; `items` must be sorted by key. */
export function nearestIndex<T>(items: T[], value: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(items[mid]) < value) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(key(items[lo - 1]) - value) <= Math.abs(key(items[lo]) - value)) return lo - 1;
  return lo;
}
