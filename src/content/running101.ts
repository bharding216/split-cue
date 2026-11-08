/**
 * Running 101 — a short primer on effort levels, workout types, and how
 * workouts are built, shown from the Workouts tab.
 */

import { Colors } from '../constants/theme';

export interface EffortLevel {
  name: string;
  effort: string;
  talk: string;
  color: string;
}

export interface WorkoutTypeInfo {
  name: string;
  summary: string;
  example: string;
}

export interface ComparisonWorkout {
  title: string;
  steps: string[];
  note: string;
}

export interface BuildingBlock {
  name: string;
  summary: string;
}

export interface WeekDay {
  day: string;
  workout: string;
}

export const RUNNING_101_INTRO =
  'A workout has three parts: why you run it, how hard you go, and how it is organized. ' +
  '"Tempo" describes how hard. "Intervals" describes how it is organized. A run can be both.';

export const EFFORT_LEVELS: EffortLevel[] = [
  { name: 'Recovery', effort: '2–3', talk: 'Full conversation', color: Colors.accent },
  { name: 'Easy', effort: '3–4', talk: 'Complete sentences', color: Colors.easy },
  { name: 'Steady', effort: '5–6', talk: 'Shorter sentences', color: Colors.primaryDim },
  { name: 'Tempo', effort: '7–8', talk: 'A few words', color: Colors.warning },
  { name: 'Hard', effort: '8–9', talk: 'One or two words', color: Colors.hard },
  { name: 'Sprint', effort: '10', talk: "Can't talk", color: Colors.danger },
];

export const EFFORT_NOTE = 'Effort is on a 1–10 scale. Most of your running should feel easy.';

export const WORKOUT_TYPES: WorkoutTypeInfo[] = [
  {
    name: 'Easy',
    summary: 'Builds your aerobic engine without wearing you out. The backbone of most training.',
    example: '30 min at a pace you could chat at',
  },
  {
    name: 'Recovery',
    summary: 'Very light running on the day after a hard session. Finish feeling like you could do more.',
    example: '20 min, effort 2–3',
  },
  {
    name: 'Long Run',
    summary: 'Your longest run of the week, usually at easy effort. Builds endurance.',
    example: '70 min easy',
  },
  {
    name: 'Tempo',
    summary: 'Comfortably hard running that teaches you to hold a faster pace for longer.',
    example: '10 min easy, 20 min tempo, 10 min easy',
  },
  {
    name: 'Intervals',
    summary: 'Hard efforts with easy recovery between them. Lets you spend more total time running fast.',
    example: '5 × (3 min hard, 2 min easy jog)',
  },
  {
    name: 'Fartlek',
    summary: 'Swedish for "speed play." Intervals run by feel, without strict pace targets.',
    example: '6 × (1 min fast, 2 min easy)',
  },
  {
    name: 'Progression',
    summary: 'Start easy and get faster as you go. Practices pacing and finishing strong.',
    example: '10 min easy, 10 min steady, 10 min tempo',
  },
  {
    name: 'Hills',
    summary: 'Intervals run uphill. Builds strength and power with less pounding than flat speed work.',
    example: '8 × (45 sec hard uphill, walk or jog down)',
  },
  {
    name: 'Strides',
    summary: 'Short, relaxed accelerations, not all-out sprints. Often added to the end of an easy run.',
    example: '6 × (20 sec fast, 60–90 sec walk)',
  },
  {
    name: 'Race',
    summary: 'A race or time trial: your best effort over a set distance or time.',
    example: '5K time trial',
  },
];

export const TEMPO_VS_INTERVALS: ComparisonWorkout[] = [
  {
    title: 'Tempo run',
    steps: ['10 min easy', '20 min tempo', '10 min easy'],
    note: 'Tempo effort, one continuous block.',
  },
  {
    title: 'Tempo intervals',
    steps: ['10 min easy', '4 × (5 min tempo, 2 min easy)', '10 min easy'],
    note: 'Same effort as the tempo run, split into repeats.',
  },
  {
    title: 'Hard intervals',
    steps: ['10 min easy', '5 × (3 min hard, 3 min easy)', '10 min easy'],
    note: 'Same layout as tempo intervals, but harder.',
  },
];

export const TEMPO_VS_INTERVALS_TAKEAWAY =
  'The first two have the same effort but are organized differently. The last two are organized the same way but run at different efforts.';

export const BUILDING_BLOCKS: BuildingBlock[] = [
  { name: 'Warm up', summary: 'Easy running to get your body ready. Usually 5–15 minutes.' },
  { name: 'Segment', summary: 'One instruction: run a time or distance at an effort or pace, like "800 m at 5K pace."' },
  {
    name: 'Repeat',
    summary: 'A group of segments done several times. "5 × (800 m hard, 400 m easy)" is one repeat with two segments.',
  },
  { name: 'Rep', summary: 'Each hard effort inside a repeat. The example above has 5 reps.' },
  { name: 'Cool down', summary: 'Easy running at the end to bring your effort back down.' },
];

export const BALANCED_WEEK: WeekDay[] = [
  { day: 'Sun', workout: '45 min easy' },
  { day: 'Wed', workout: 'Intervals or tempo' },
  { day: 'Fri', workout: '30 min easy + 4 strides' },
];

export const BALANCED_WEEK_NOTE =
  'Mix a hard day with easy days, and leave recovery time in between. Hard sessions only make you fitter if you recover from them.';
