/**
 * Design tokens for SplitCue.
 * Dark-themed running-focused palette.
 */

export const Colors = {
  background: '#0A0A0F',
  surface: '#16161F',
  surfaceLight: '#1E1E2A',
  card: '#1A1A26',

  primary: '#4ADE80', // green – go/start
  primaryDim: '#22C55E',
  accent: '#60A5FA', // blue – informational
  warning: '#FBBF24', // yellow – countdown warning
  danger: '#F87171', // red – hard intervals / stop

  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#475569',

  hard: '#F87171',
  easy: '#4ADE80',
  warmup: '#FBBF24',
  cooldown: '#60A5FA',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  timer: 72,
} as const;

/**
 * `maxFontSizeMultiplier` caps for text that is already large. Body text
 * scales freely; headings and the timer would otherwise overflow the screen.
 */
export const MaxFontScale = {
  timer: 1.25,
  display: 1.5,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export function intervalColor(type: string): string {
  switch (type) {
    case 'hard':
      return Colors.hard;
    case 'easy':
    case 'recovery':
      return Colors.easy;
    case 'warmup':
      return Colors.warmup;
    case 'cooldown':
      return Colors.cooldown;
    case 'run':
      return Colors.hard;
    case 'rest':
      return Colors.textMuted;
    default:
      return Colors.textSecondary;
  }
}
