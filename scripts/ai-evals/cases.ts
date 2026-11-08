/**
 * Runner profiles for the plan-quality eval. Each case mirrors the request
 * body the app sends to generate-plan-outline. Dates are filled in at run time
 * from `weeks` (plus `extraDays` for a partial final week).
 */

import type { RequestBody } from '../../supabase/functions/generate-plan-outline/prompt';

export interface EvalCase {
  id: string;
  /** What a good plan must get right, for the human reviewer. */
  lookFor: string;
  weeks: number;
  extraDays?: number;
  body: Omit<RequestBody, 'start_date' | 'race_date'>;
}

export const CASES: EvalCase[] = [
  {
    id: 'beginner-first-5k',
    lookFor: 'Gentle volume, walk/run friendly, no hard intervals early.',
    weeks: 8,
    body: {
      profile: { experience_level: 'beginner', typical_run_minutes: 20, easy_pace: 12.5, weekly_mileage: 5 },
      goals: ['Finish my first 5K'],
      race_type: '5k',
      race_distance_meters: 5000,
      days_per_week: 3,
    },
  },
  {
    id: 'couch-to-5k-limited',
    lookFor: 'Starts with run/walk; respects 10-minute continuous limit.',
    weeks: 10,
    body: {
      profile: { experience_level: 'beginner', typical_run_minutes: 10, weekly_mileage: 0 },
      limitations: ['Can only run about 10 minutes continuously right now'],
      race_type: '5k',
      race_distance_meters: 5000,
      days_per_week: 3,
    },
  },
  {
    id: 'intermediate-10k-goal',
    lookFor: 'Paces consistent with a 50:00 10K; 3–4 days per week.',
    weeks: 10,
    body: {
      profile: { experience_level: 'intermediate', typical_run_minutes: 40, easy_pace: 9.75, fast_pace: 8.0, weekly_mileage: 18 },
      race_type: '10k',
      race_distance_meters: 10000,
      goal_time_minutes: 50,
      days_per_week: 4,
      days_per_week_min: 3,
    },
  },
  {
    id: 'half-locked-days',
    lookFor: 'Tuesday and Saturday always training days; long run on a sensible day.',
    weeks: 12,
    body: {
      profile: {
        experience_level: 'intermediate', typical_run_minutes: 45, easy_pace: 10.0, fast_pace: 8.25, weekly_mileage: 20,
        preferred_days: [
          { day: 'tuesday', locked: true },
          { day: 'thursday', locked: false },
          { day: 'saturday', locked: true },
          { day: 'sunday', locked: false },
        ],
      },
      race_type: 'half_marathon',
      race_distance_meters: 21097,
      goal_time_minutes: 115,
      days_per_week: 4,
    },
  },
  {
    id: 'marathon-advanced-6-days',
    lookFor: 'Peak ~50–60 mpw, 20-mile long run, real taper.',
    weeks: 18,
    body: {
      profile: { experience_level: 'advanced', typical_run_minutes: 60, easy_pace: 8.5, fast_pace: 6.75, weekly_mileage: 40 },
      race_type: 'marathon',
      race_distance_meters: 42195,
      goal_time_minutes: 195,
      days_per_week: 6,
    },
  },
  {
    id: 'marathon-low-base',
    lookFor: 'Mileage climbs gradually from 12 mpw with cutback weeks; no reckless jumps.',
    weeks: 16,
    body: {
      profile: { experience_level: 'beginner', typical_run_minutes: 30, easy_pace: 11.0, weekly_mileage: 12 },
      goals: ['Finish my first marathon'],
      race_type: 'marathon',
      race_distance_meters: 42195,
      days_per_week: 4,
    },
  },
  {
    id: 'injury-shin-splints',
    lookFor: 'Conservative volume, no back-to-back run days, mentions recovery.',
    weeks: 8,
    body: {
      profile: { experience_level: 'intermediate', typical_run_minutes: 35, easy_pace: 10.0, fast_pace: 8.5, weekly_mileage: 15 },
      limitations: ['Recovering from shin splints', 'No back-to-back running days'],
      race_type: '10k',
      race_distance_meters: 10000,
      days_per_week: 3,
    },
  },
  {
    id: 'pace-target-coach-picks',
    lookFor: 'Realistic goal_pace near 11:00/mi; opens with Baseline Run; ends with benchmark, no Race Day.',
    weeks: 8,
    body: {
      profile: { experience_level: 'beginner', typical_run_minutes: 25, weekly_mileage: 8 },
      race_type: '5k',
      goal_type: 'pace_target',
      goal_pace: null,
      pace_baseline: 'About 11:40/mi for 5K (from your recent runs)',
      days_per_week: 3,
    },
  },
  {
    id: 'pace-target-explicit',
    lookFor: 'Builds toward 8:00/mi at 10K; tempo near goal pace; no taper or Race Day.',
    weeks: 10,
    body: {
      profile: { experience_level: 'intermediate', typical_run_minutes: 40, easy_pace: 10.0, fast_pace: 8.5, weekly_mileage: 18 },
      race_type: '10k',
      goal_type: 'pace_target',
      goal_pace: 8.0,
      days_per_week: 4,
    },
  },
  {
    id: 'short-partial-week',
    lookFor: 'Handles a 4-week + 3-day plan; final short week ends exactly on Race Day.',
    weeks: 4,
    extraDays: 3,
    body: {
      profile: { experience_level: 'intermediate', typical_run_minutes: 30, easy_pace: 9.5, fast_pace: 7.75, weekly_mileage: 15 },
      race_type: '5k',
      race_distance_meters: 5000,
      days_per_week: 3,
    },
  },
  {
    id: 'older-cross-training',
    lookFor: 'Accounts for cycling/swimming load and extra recovery.',
    weeks: 14,
    body: {
      profile: {
        experience_level: 'intermediate', typical_run_minutes: 40, easy_pace: 11.0, fast_pace: 9.5, weekly_mileage: 15,
        cross_training: ['cycling', 'swimming'],
      },
      limitations: ['Age 58 — prioritize recovery'],
      race_type: 'half_marathon',
      race_distance_meters: 21097,
      days_per_week: 3,
    },
  },
  {
    id: 'custom-15k',
    lookFor: 'Treats 15000m correctly; long run reaches ~9–10 miles.',
    weeks: 12,
    body: {
      profile: { experience_level: 'intermediate', typical_run_minutes: 45, easy_pace: 9.25, fast_pace: 7.5, weekly_mileage: 25 },
      race_type: 'custom',
      race_distance_meters: 15000,
      days_per_week: 5,
    },
  },
];
