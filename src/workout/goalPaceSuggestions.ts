/**
 * Goal pace suggestions for pace-target plans.
 *
 * Estimates the runner's current pace for a distance from whatever data we
 * have (race times → fast/easy pace → GPS history → self-reported mile time),
 * then proposes easier / realistic / stretch goals scaled by plan length and
 * experience. All paces are min/mile decimals.
 */

import type { ExperienceLevel, RaceTimes, RaceType, RunningProfile } from '../types/database';
import type { CompletedWorkout } from './workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';

const METERS_PER_MILE = 1609.344;
const KM_PER_MILE = 1.609344;
const MS_PER_DAY = 86_400_000;

/** Riegel fatigue exponent: T2 = T1 · (D2/D1)^1.06 */
const RIEGEL_EXPONENT = 1.06;

const DISTANCE_METERS: Record<string, number> = {
  mile: METERS_PER_MILE,
  '5k': 5000,
  '10k': 10000,
  half_marathon: 21097.5,
  marathon: 42195,
};

const DISTANCE_LABELS: Record<string, string> = {
  mile: 'mile',
  '5k': '5K',
  '10k': '10K',
  half_marathon: 'half marathon',
  marathon: 'marathon',
};

/** Typical easy pace is ~1:15/mi slower than 5K pace. */
const EASY_TO_5K_OFFSET = 1.25;

/** Improvement over a 12-week block for the realistic tier. */
const REALISTIC_PCT_12_WEEKS: Record<ExperienceLevel, number> = {
  beginner: 0.07,
  intermediate: 0.05,
  advanced: 0.03,
};

export type PaceDistance = RaceType | 'any';

export type BaselineSource = 'race_time' | 'fast_pace' | 'easy_pace' | 'history' | 'mile_estimate';

export interface PaceBaseline {
  /** Estimated current pace (min/mi) at the target distance. */
  pace: number;
  source: BaselineSource;
  /** Short human-readable origin, e.g. "your 5K time" or "your recent runs". */
  detail: string;
}

export type GoalTierId = 'easier' | 'realistic' | 'stretch';

export interface GoalPaceTier {
  id: GoalTierId;
  label: string;
  /** Goal pace in min/mi. */
  pace: number;
  /** Fractional improvement over baseline (0.05 = 5% faster). */
  improvementPct: number;
}

export type MileEstimate = 'under_9' | '9_11' | '11_13' | '13_plus' | 'cant_yet';

export const MILE_ESTIMATE_OPTIONS: { value: MileEstimate; label: string; minutes: number | null }[] = [
  { value: 'under_9', label: 'Under 9 min', minutes: 8.5 },
  { value: '9_11', label: '9–11 min', minutes: 10 },
  { value: '11_13', label: '11–13 min', minutes: 12 },
  { value: '13_plus', label: '13+ min', minutes: 14 },
  { value: 'cant_yet', label: "I can't run a mile yet", minutes: null },
];

// ── Unit helpers ─────────────────────────────────────────────

export function paceToUnit(paceMinPerMile: number, unit: PaceUnit): number {
  return unit === 'minPerKm' ? paceMinPerMile / KM_PER_MILE : paceMinPerMile;
}

export function paceFromUnit(pace: number, unit: PaceUnit): number {
  return unit === 'minPerKm' ? pace * KM_PER_MILE : pace;
}

export function paceUnitSuffix(unit: PaceUnit): string {
  return unit === 'minPerKm' ? '/km' : '/mi';
}

/** Round a pace (in any unit) to the nearest `stepSec` seconds. */
export function roundPace(pace: number, stepSec = 5): number {
  return (Math.round((pace * 60) / stepSec) * stepSec) / 60;
}

/** Split a decimal pace into whole minutes and seconds, handling the :60 rollover. */
export function splitPace(pace: number): { min: number; sec: number } {
  const total = Math.round(pace * 60);
  return { min: Math.floor(total / 60), sec: total % 60 };
}

export function formatPace(pace: number): string {
  const { min, sec } = splitPace(pace);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ── Baseline estimation ──────────────────────────────────────

function targetMeters(distance: PaceDistance): number {
  return DISTANCE_METERS[distance] ?? DISTANCE_METERS['5k'];
}

/** Project a pace held over `fromMeters` to the equivalent pace over `toMeters`. */
function projectPace(pace: number, fromMeters: number, toMeters: number): number {
  return pace * Math.pow(toMeters / fromMeters, RIEGEL_EXPONENT - 1);
}

function fromRaceTimes(raceTimes: RaceTimes | null | undefined, toMeters: number): PaceBaseline | null {
  if (!raceTimes) return null;
  const candidates = Object.entries(raceTimes)
    .map(([key, entry]) => {
      const seconds = entry?.avg ?? entry?.fast ?? entry?.slow;
      const meters = DISTANCE_METERS[key];
      return seconds && meters ? { key, seconds, meters } : null;
    })
    .filter((c): c is { key: string; seconds: number; meters: number } => c != null);
  if (candidates.length === 0) return null;

  // Closest distance gives the most reliable projection
  candidates.sort(
    (a, b) => Math.abs(Math.log(a.meters / toMeters)) - Math.abs(Math.log(b.meters / toMeters)),
  );
  const best = candidates[0];
  const pace = best.seconds / 60 / (best.meters / METERS_PER_MILE);
  return {
    pace: projectPace(pace, best.meters, toMeters),
    source: 'race_time',
    detail: `your ${DISTANCE_LABELS[best.key] ?? best.key} time`,
  };
}

function fromHistory(history: CompletedWorkout[], toMeters: number): PaceBaseline | null {
  const cutoff = Date.now() - 60 * MS_PER_DAY;
  const runs = history
    .filter((w) => w.completedAt >= cutoff && (w.totalDistanceMeters ?? 0) >= METERS_PER_MILE)
    .map((w) => ({
      meters: w.totalDistanceMeters!,
      pace: w.totalDurationMs / 60_000 / (w.totalDistanceMeters! / METERS_PER_MILE),
    }))
    // Drop GPS glitches and walks
    .filter((r) => isFinite(r.pace) && r.pace >= 4 && r.pace <= 20);
  if (runs.length < 2) return null;

  const median = <T>(arr: T[], key: (t: T) => number) => {
    const sorted = arr.map(key).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const pace = median(runs, (r) => r.pace);
  const meters = median(runs, (r) => r.meters);
  return {
    pace: projectPace(pace, meters, toMeters),
    source: 'history',
    detail: 'your recent runs',
  };
}

/**
 * Best-available estimate of the runner's current pace at `distance`.
 * Returns null when there is nothing to go on.
 */
export function estimateCurrentPace(
  profile: Pick<RunningProfile, 'race_times' | 'fast_pace' | 'easy_pace'> | null,
  history: CompletedWorkout[],
  distance: PaceDistance,
  mileEstimate?: MileEstimate | null,
): PaceBaseline | null {
  const toMeters = targetMeters(distance);
  const fiveK = DISTANCE_METERS['5k'];

  const race = fromRaceTimes(profile?.race_times, toMeters);
  if (race) return race;

  if (profile?.fast_pace) {
    return { pace: projectPace(profile.fast_pace, fiveK, toMeters), source: 'fast_pace', detail: 'your fast pace' };
  }
  if (profile?.easy_pace) {
    return {
      pace: projectPace(profile.easy_pace - EASY_TO_5K_OFFSET, fiveK, toMeters),
      source: 'easy_pace',
      detail: 'your easy pace',
    };
  }

  const hist = fromHistory(history, toMeters);
  if (hist) return hist;

  const mile = MILE_ESTIMATE_OPTIONS.find((o) => o.value === mileEstimate)?.minutes;
  if (mile) {
    return {
      pace: projectPace(mile, METERS_PER_MILE, toMeters),
      source: 'mile_estimate',
      detail: 'your mile time',
    };
  }

  return null;
}

// ── Goal tiers ───────────────────────────────────────────────

function realisticPct(weeks: number, experience: ExperienceLevel | null | undefined): number {
  const base = REALISTIC_PCT_12_WEEKS[experience ?? 'beginner'];
  const scale = Math.min(1.25, Math.max(0.35, weeks / 12));
  return base * scale;
}

export function suggestGoalTiers(
  baseline: PaceBaseline,
  weeks: number,
  experience: ExperienceLevel | null | undefined,
): GoalPaceTier[] {
  const realistic = realisticPct(weeks, experience);
  const tiers: { id: GoalTierId; label: string; pct: number }[] = [
    { id: 'easier', label: 'Easier', pct: realistic * 0.5 },
    { id: 'realistic', label: 'Realistic', pct: realistic },
    { id: 'stretch', label: 'Stretch', pct: realistic * 1.6 },
  ];
  return tiers.map((t) => ({
    id: t.id,
    label: t.label,
    pace: baseline.pace * (1 - t.pct),
    improvementPct: t.pct,
  }));
}

export type GoalPaceAssessment = 'ok' | 'aggressive' | 'already_there';

/** Flag goals well beyond the stretch tier, or slower than current fitness. */
export function assessGoalPace(
  goalPace: number,
  baseline: PaceBaseline,
  weeks: number,
  experience: ExperienceLevel | null | undefined,
): GoalPaceAssessment {
  const improvement = 1 - goalPace / baseline.pace;
  const stretch = realisticPct(weeks, experience) * 1.6;
  if (improvement > Math.max(stretch + 0.03, weeks < 8 ? 0.08 : 0.15)) return 'aggressive';
  if (improvement < -0.02) return 'already_there';
  return 'ok';
}

export function weeksBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * MS_PER_DAY)));
}
