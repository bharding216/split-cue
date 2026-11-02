export interface Announcement {
  /** Unique, never-reused identifier. */
  id: string;
  /** ISO date string — when this announcement was introduced. */
  date: string;
  /** ISO date string — stop showing after this date. */
  expiresAt: string;
  title: string;
  body: string;
}

/**
 * Newest first. Only the first eligible announcement is shown per app open.
 *
 * To announce a new feature:
 *   1. Add an entry at the TOP of this array.
 *   2. Push an OTA update: `eas update --branch production --message "..."`.
 */
export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: '2026-11-training-plans-fixed',
    // Full timestamp so users who installed on Nov 1 (and hit the bug) still qualify.
    date: '2026-11-02T02:30:00Z',
    expiresAt: '2026-11-30',
    title: 'Training Plans Are Back on Track',
    body: "We fixed an issue that kept some new training plans from saving. If you ran into an error, thank you for your patience — your plan is ready to build from the Training tab.",
  },
  {
    id: '2026-10-gps-pace-tracking',
    date: '2026-10-15',
    expiresAt: '2026-11-15',
    title: "New: GPS Pace Tracking",
    body: 'Get real-time pace cues during your runs! Enable it in Settings → Pace.',
  },
  // {
  //   id: '2026-10-widget-support',
  //   date: '2026-10-06',
  //   expiresAt: '2026-10-20',
  //   title: "What's New: Home Screen Widgets",
  //   body: 'You can now add a SplitCue widget to your home screen to start workouts faster!',
  // },
];
