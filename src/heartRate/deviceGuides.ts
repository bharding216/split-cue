/**
 * Setup help for heart rate monitors, shared by the app's Heart Rate Monitor
 * screen and the help page at splitcue.app (bundled into the website worker).
 *
 * Plain data only: no React Native imports, so the worker can bundle it.
 * Menu names vary between watch models and firmware versions, so steps name
 * the setting and say where it usually is rather than giving exact paths.
 */

export const HR_HELP_URL = 'https://splitcue.app/help/heart-rate-monitors';

export type DeviceGuideKind = 'strap' | 'watch' | 'limited';

export interface DeviceGuide {
  /** Stable ID, also the help page anchor and the analytics value. */
  id: string;
  /** Tile label in the app. */
  name: string;
  /** Examples shown under the name. */
  examples: string;
  kind: DeviceGuideKind;
  steps: string[];
  note?: string;
}

const ADD_DEVICE_STEP =
  'In SplitCue, go to Settings → Heart Rate Monitor, tap Add Device, and choose your device from the list.';

export const DEVICE_GUIDES: DeviceGuide[] = [
  {
    id: 'polar',
    name: 'Polar',
    examples: 'H10, H9, Verity Sense, Polar watches',
    kind: 'strap',
    steps: [
      'Chest strap: wet the electrode area on the back of the strap and put it on snugly. It turns on by itself when it senses your heartbeat.',
      'Verity Sense: press the button to turn it on.',
      'Polar watch: turn on the setting that shares heart rate with other devices (often called “Share HR with other devices”), then start a training session on the watch.',
      ADD_DEVICE_STEP,
    ],
    note: 'The H10 can connect to two apps at once; most other Polar sensors connect to one.',
  },
  {
    id: 'garmin-strap',
    name: 'Garmin strap',
    examples: 'HRM-Dual, HRM-Pro, HRM 200, HRM 600',
    kind: 'strap',
    steps: [
      'Wet the electrodes and put the strap on snugly. It starts broadcasting when it senses your heartbeat.',
      ADD_DEVICE_STEP,
    ],
    note: 'If the strap is also paired to your Garmin watch, that’s fine. The watch typically uses ANT+, which doesn’t block SplitCue’s Bluetooth connection.',
  },
  {
    id: 'garmin-watch',
    name: 'Garmin watch',
    examples: 'Forerunner, Fenix, Venu, Instinct',
    kind: 'watch',
    steps: [
      'On the watch, turn on Broadcast Heart Rate. On most models it’s in Settings under Health & Wellness or Wrist Heart Rate, and some models also have it in the controls menu.',
      'Keep the broadcast screen open, or turn on Broadcast During Activity and start an activity on the watch.',
      ADD_DEVICE_STEP,
    ],
    note: 'Broadcasting uses extra watch battery. Turn it off after your run.',
  },
  {
    id: 'amazfit',
    name: 'Amazfit',
    examples: 'Bip, Balance, Cheetah, T-Rex, GTR',
    kind: 'watch',
    steps: [
      'On the watch, turn on Heart Rate Push. It’s usually in Settings under Workout, or in the workout settings.',
      'Leave Heart Rate Push running (some models only broadcast while it’s active or during a workout).',
      ADD_DEVICE_STEP,
    ],
    note: 'If you also use Pulsoid or another heart rate app, close it first. Most watches send heart rate to only one app at a time.',
  },
  {
    id: 'coros',
    name: 'COROS',
    examples: 'Pace, Apex, Vertix, heart rate monitor',
    kind: 'watch',
    steps: [
      'COROS heart rate monitor (armband): put it on and turn it on.',
      'COROS watch: turn on Heart Rate Broadcast, in the watch’s settings or control panel.',
      ADD_DEVICE_STEP,
    ],
  },
  {
    id: 'wahoo',
    name: 'Wahoo',
    examples: 'TICKR, TICKR X, TICKR FIT',
    kind: 'strap',
    steps: [
      'Wet the electrodes and put the strap on (TICKR FIT goes on your forearm). The lights blink when it’s on.',
      ADD_DEVICE_STEP,
    ],
    note: 'TICKR straps can connect to several apps at once.',
  },
  {
    id: 'whoop',
    name: 'WHOOP',
    examples: 'WHOOP 4.0, WHOOP MG',
    kind: 'watch',
    steps: [
      'In the WHOOP app, turn on Heart Rate Broadcast (under device settings).',
      ADD_DEVICE_STEP,
    ],
  },
  {
    id: 'other-strap',
    name: 'Other strap',
    examples: 'CooSpo, Magene, Decathlon, Suunto, Triacle and more',
    kind: 'strap',
    steps: [
      'Make sure your strap supports Bluetooth (some older straps are ANT+ only).',
      'Wet the electrodes and put it on snugly so it wakes up.',
      ADD_DEVICE_STEP,
    ],
  },
  {
    id: 'apple-watch',
    name: 'Apple Watch',
    examples: 'All models',
    kind: 'limited',
    steps: [
      'Apple Watch doesn’t share live heart rate with other apps over Bluetooth on its own.',
      'Some heart rate broadcasting apps on the App Store can do this. Install one on your watch, start broadcasting, then tap Add Device in SplitCue.',
    ],
    note: 'Results depend on the broadcasting app. A chest strap is the most reliable option.',
  },
  {
    id: 'other-watch',
    name: 'Fitbit, Samsung & others',
    examples: 'Fitbit, Galaxy Watch, Pixel Watch',
    kind: 'limited',
    steps: [
      'Fitbit devices can’t share live heart rate with other apps, so they don’t work with SplitCue.',
      'Galaxy Watch, Pixel Watch, and other Wear OS watches need a heart rate broadcasting app from their app store. Results vary by app and watch.',
    ],
    note: 'For reliable recording, use a Bluetooth chest strap or armband.',
  },
];

/**
 * Models verified with SplitCue, listed on the help page. Only add a model
 * after a real recording works; `hr_device_paired` events show what people pair.
 */
export const CONFIRMED_DEVICES: string[] = [];

export const SUPPORT_EMAIL = 'brandon@getsurmount.com';

/** Shown when a search finds nothing, most common fix first. */
export const NOT_FOUND_TIPS: string[] = [
  'Disconnect other apps that use your monitor, such as Pulsoid, Zwift, Peloton, or another running app. Many monitors connect to only one app at a time.',
  'Wake it up: wear the strap with damp electrodes, or turn on heart rate broadcasting on your watch.',
  'Keep it within a few feet of your phone while searching.',
  'If you paired it in your phone’s Bluetooth settings, forget it there. SplitCue connects directly and doesn’t need that.',
  'Still nothing? Replace the strap’s battery, or turn broadcasting off and on again.',
];

/** Shown when the monitor is connected but no readings arrive. */
export const NO_READINGS_TIP =
  'Connected, but no heart rate yet. Make sure the strap is snug and its electrodes are damp, or that heart rate broadcasting is still on.';

/** Shown on the help page for drops during a run. */
export const DROPOUT_TIPS: string[] = [
  'Your body can block Bluetooth. Carry your phone on the same side as your watch, or in front rather than in a back pocket.',
  'Dry electrodes are the most common cause of drops in the first few minutes. Wet them before you start.',
  'If the signal drops, SplitCue keeps your workout running and reconnects automatically. The gap shows as a break in your heart rate graph, and nothing is filled in.',
];
