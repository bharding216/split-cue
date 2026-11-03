import { useWindowDimensions } from 'react-native';

/** System font scale at which layouts switch to their large-text arrangement. */
const LARGE_FONT_SCALE = 1.3;

/** Window widths below this (e.g. iOS Display Zoom, Android Display size) count as large text. */
const NARROW_WIDTH = 360;

/** True when the user's text size or display zoom needs roomier, stacked layouts. */
export function useLargeText(): boolean {
  const { fontScale, width } = useWindowDimensions();
  return fontScale >= LARGE_FONT_SCALE || width < NARROW_WIDTH;
}

/**
 * Scales a fixed box size (e.g. a text input's width) along with text that is
 * capped at `maxMultiplier` via `maxFontSizeMultiplier`. Never shrinks below `size`.
 */
export function useScaledSize(size: number, maxMultiplier: number): number {
  const { fontScale } = useWindowDimensions();
  return Math.round(size * Math.max(1, Math.min(fontScale, maxMultiplier)));
}
