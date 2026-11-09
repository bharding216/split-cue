/**
 * Training plan service — client-side API for generating plans,
 * adjusting them via AI chat, and CRUD operations against Supabase.
 *
 * Plan generation uses a two-phase lazy approach:
 *   1. generatePlanOutline() — fast single-call outline (week themes + day labels, no workout objects)
 *   2. generateWorkoutDetails() — on-demand batch detail for N specific dates
 *
 * ensureUpcomingWorkoutsDetailed() auto-fills undetailed workouts in the next 14 days,
 * calibrated to the runner's recent runs. reviewCompletedRun() analyzes each finished
 * plan run and proposes changes to upcoming workouts.
 */

import { supabase } from '../analytics/supabaseClient';
import type { AiClientMeta } from '../analytics/aiOutcome';
import { generateId, parseWorkoutCategory, type CompletedWorkout } from '../workout/workoutTypes';
import { migrateToBlockModel } from '../workout/workoutStorage';
import type { TrainingPlan, PlanWorkout, PlanOutlineWeek, PlanPhase, RaceType, GoalType } from '../types/database';
import { sanitizeBlock, type AIContext } from './aiWorkoutService';
import { buildHistorySummary, serializeHistorySummary } from './historySummary';

// ── Types ────────────────────────────────────────────────────

export interface PlanGenerationInput {
  profile: {
    experience_level?: string;
    typical_run_minutes?: number;
    typical_run_minutes_max?: number;
    easy_pace?: number;
    fast_pace?: number;
    race_times?: Record<string, { slow: number | null; avg: number | null; fast: number | null }> | null;
    weekly_mileage?: number;
    longest_recent_run_minutes?: number;
    max_workout_minutes?: number;
    preferred_days?: { day: string; locked: boolean }[];
    cross_training?: string[];
  };
  goals: string[];
  preferences: string[];
  limitations: string[];
  raceType: RaceType;
  /** For custom races — the distance in meters. */
  customDistanceMeters?: number;
  raceDate: string;
  goalTimeMinutes?: number | null;
  /** 'race' (default) or 'pace_target' — determines plan structure and AI prompts. */
  goalType?: GoalType;
  /** Target pace in min/mile decimal (e.g. 8.5 = 8:30/mi). Only for pace_target plans. */
  goalPace?: number | null;
  /** Human-readable current pace estimate passed to the coach, e.g. "About 11:40/mi for 5K (from your recent runs)". */
  paceBaseline?: string | null;
  startDate: string;
  daysPerWeek: number;
  /** If set, the user prefers a flexible range from daysPerWeekMin to daysPerWeek days. */
  daysPerWeekMin?: number;
  historySummary?: string | null;
  /** When true, AI should prescribe effort/RPE-based workouts instead of pace targets. */
  useEffortBased?: boolean;
}

/** Outline result — no workout objects, just week themes and day labels. */
export interface PlanOutlineResult {
  title: string;
  weeks: PlanOutlineWeek[];
  /** Pace chosen by the coach (min/mi) when a pace_target plan was requested without one. */
  suggested_goal_pace?: number | null;
  /** Coach's high-level description of the plan strategy, shown for approval. */
  approach?: string | null;
  phases?: PlanPhase[] | null;
  /** Coach's reply to revision feedback. Only set on revisions. */
  message?: string | null;
}

export interface PlanRevisionRequest {
  previous: PlanOutlineResult;
  feedback: string;
  /** Earlier feedback from the same review session, oldest first. */
  priorFeedback?: string[];
}

/** Detail result — full workout objects for specific dates. */
export interface WorkoutDetailResult {
  workouts: {
    date: string;
    workout: {
      name: string;
      category?: string;
      warmup?: unknown[];
      blocks: unknown[];
      cooldown?: unknown[];
      targetDistanceMeters?: number;
    };
  }[];
}

export interface PlanAdjustmentResult {
  message: string;
  modifications: PlanModification[];
  /** Links outcome events to the logged request. */
  requestId?: string;
}

export interface PlanModification {
  date: string;
  action: 'update' | 'skip';
  day_label?: string;
  description?: string;
  workout?: {
    name: string;
    category?: string;
    warmup: unknown[];
    blocks: unknown[];
    cooldown: unknown[];
  } | null;
}

// ── Workout Analysis Types ──────────────────────────────────

export interface WorkoutAnalysis {
  performance_rating: 'on_target' | 'exceeded' | 'struggled' | 'incomplete';
  fatigue_signal: 'normal' | 'elevated' | 'concerning';
  key_observations: string[];
  recommendation: 'maintain' | 'increase' | 'decrease' | 'rest';
  coach_message: string;
  plan_update: {
    requires_changes: boolean;
    reason: string;
    workout_changes: PlanModification[];
  };
}

export interface WorkoutAnalysisInput {
  completed_workout: {
    name: string;
    total_duration_ms: number;
    total_distance_meters?: number | null;
    splits?: {
      label?: string;
      type?: string;
      pace_min_per_mile: number;
      distance_meters: number;
      target_pace?: number | null;
    }[];
    average_pace_min_per_mile?: number | null;
  };
  planned_workout?: {
    day_label: string;
    description?: string;
    workout_data?: unknown;
  } | null;
  profile?: {
    experience_level?: string;
    easy_pace?: number;
    fast_pace?: number;
  } | null;
  recent_history_summary?: string | null;
  /** YYYY-MM-DD in the runner's local time. */
  today?: string;
  /** The only plan days the coach may propose changes to. */
  upcoming_workouts?: { date: string; day_label: string; description: string | null }[];
  missed_workouts_last_14_days?: number;
}

/** Runner context shared by every AI call that writes workout detail. */
export interface CoachContext {
  profile?: {
    experience_level?: string;
    typical_run_minutes?: number;
    typical_run_minutes_max?: number;
    easy_pace?: number;
    fast_pace?: number;
    race_times?: Record<string, { slow: number | null; avg: number | null; fast: number | null }> | null;
  };
  historySummary?: string | null;
}

// ── Supabase error helper ───────────────────────────────────

async function extractFunctionError(error: any, fallback: string): Promise<string> {
  try {
    if (error.context && typeof error.context.json === 'function') {
      const body = await error.context.json().catch(() => null);
      if (body?.error) return body.error;
    }
    if (error.message) return error.message;
  } catch {
    // ignore
  }
  return fallback;
}

// ── AI Workout Normalizer ───────────────────────────────────

/** Normalize AI-generated workout data to the new block model.
 * Old-format responses (warmup/blocks/cooldown) are migrated.
 * New-format responses (blocks with blockType) are passed through.
 */

// ── Phase 1: Plan Outline ───────────────────────────────────

export async function generatePlanOutline(
  input: PlanGenerationInput,
  revision?: PlanRevisionRequest,
): Promise<PlanOutlineResult> {
  const { data, error } = await supabase.functions.invoke('generate-plan-outline', {
    body: {
      profile: {
        experience_level: input.profile.experience_level,
        typical_run_minutes: input.profile.typical_run_minutes,
        typical_run_minutes_max: input.profile.typical_run_minutes_max,
        easy_pace: input.profile.easy_pace,
        fast_pace: input.profile.fast_pace,
        race_times: input.profile.race_times,
        weekly_mileage: input.profile.weekly_mileage,
        longest_recent_run_minutes: input.profile.longest_recent_run_minutes,
        max_workout_minutes: input.profile.max_workout_minutes,
        preferred_days: input.profile.preferred_days,
        cross_training: input.profile.cross_training,
      },
      goals: input.goals,
      preferences: input.preferences,
      limitations: input.limitations,
      race_type: input.raceType,
      race_distance_meters: input.raceType === 'custom' ? (input.customDistanceMeters ?? null) : getRaceDistanceMeters(input.raceType),
      race_date: input.raceDate,
      goal_time_minutes: input.goalTimeMinutes,
      goal_type: input.goalType ?? 'race',
      goal_pace: input.goalPace ?? null,
      pace_baseline: input.paceBaseline ?? null,
      start_date: input.startDate,
      days_per_week: input.daysPerWeek,
      days_per_week_min: input.daysPerWeekMin ?? null,
      history_summary: input.historySummary,
      use_effort_based: input.useEffortBased ?? false,
      revision: revision
        ? {
            previous: {
              approach: revision.previous.approach ?? null,
              phases: revision.previous.phases ?? null,
              goal_pace: revision.previous.suggested_goal_pace ?? null,
              weeks: revision.previous.weeks.map((w) => ({
                theme: w.theme,
                total_miles_target: w.total_miles_target,
                days: w.days.map((d) => ({ day_label: d.day_label, description: d.description })),
              })),
            },
            feedback: revision.feedback,
            prior_feedback: revision.priorFeedback ?? [],
          }
        : null,
    },
  });

  if (error) {
    throw new Error(await extractFunctionError(error, 'Failed to generate plan outline'));
  }
  if (data?.error) {
    throw new Error(data.error);
  }

  return data as PlanOutlineResult;
}

// ── Phase 2: On-demand Workout Detail ───────────────────────

/** Generate detailed workout objects for specific plan_workout rows. */
export async function generateWorkoutDetails(
  plan: TrainingPlan,
  workoutsToDetail: PlanWorkout[],
  context?: CoachContext,
): Promise<void> {
  if (workoutsToDetail.length === 0) return;

  const outline = plan.outline ?? [];

  // Build the request payload with week context for each workout
  const workoutRequests = workoutsToDetail.map((pw) => {
    const week = outline.find((w) => w.week_number === pw.week_number);
    return {
      date: pw.date,
      day_label: pw.day_label ?? 'Training',
      description: pw.description,
      week_number: pw.week_number,
      week_theme: week?.theme ?? `Week ${pw.week_number}`,
      total_miles_target: week?.total_miles_target ?? null,
    };
  });

  const totalWeeks = outline.length || Math.max(...workoutsToDetail.map((w) => w.week_number), 1);

  const { data, error } = await supabase.functions.invoke('generate-workouts', {
    body: {
      profile: context?.profile,
      history_summary: context?.historySummary ?? null,
      race_type: plan.race_type,
      race_date: plan.race_date,
      goal_time_minutes: plan.goal_time_minutes,
      goal_type: plan.goal_type ?? 'race',
      goal_pace: plan.goal_pace ?? null,
      days_per_week: plan.days_per_week,
      total_weeks: totalWeeks,
      workouts: workoutRequests,
    },
  });

  if (error) {
    throw new Error(await extractFunctionError(error, 'Failed to generate workout details'));
  }
  if (data?.error) {
    throw new Error(data.error);
  }

  const result = data as WorkoutDetailResult;

  // Patch all workouts in parallel
  await Promise.all(
    result.workouts.map((detail) => {
      const matchingPw = workoutsToDetail.find((pw) => pw.date === detail.date);
      if (!matchingPw || !detail.workout) return Promise.resolve();

      const workoutData = migrateToBlockModel({
        id: generateId(),
        name: detail.workout.name,
        category: parseWorkoutCategory(detail.workout.category),
        warmup: detail.workout.warmup ?? [],
        blocks: detail.workout.blocks ?? [],
        cooldown: detail.workout.cooldown ?? [],
        targetDistanceMeters: detail.workout.targetDistanceMeters,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      workoutData.blocks = workoutData.blocks.map(sanitizeBlock);

      return supabase
        .from('plan_workouts')
        .update({
          workout_data: workoutData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', matchingPw.id);
    })
  );
}

// ── Coach context ───────────────────────────────────────────

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isRestDayLabel(label: string | null | undefined): boolean {
  const l = label?.toLowerCase() ?? '';
  return l.includes('rest') || l.includes('off');
}

/** Plan days in the last 14 days whose date passed without the run being done or skipped. */
function countMissedWorkouts(planWorkouts: PlanWorkout[], todayStr: string): number {
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sinceStr = localDateKey(since);
  return planWorkouts.filter((w) =>
    w.date >= sinceStr &&
    w.date < todayStr &&
    w.status === 'planned' &&
    !isRestDayLabel(w.day_label)
  ).length;
}

/** Last-14-day plan adherence, appended to the history summary so the coach can calibrate. */
export function describePlanAdherence(planWorkouts: PlanWorkout[]): string | null {
  const todayStr = localDateKey(new Date());
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sinceStr = localDateKey(since);
  const past = planWorkouts.filter((w) => w.date >= sinceStr && w.date < todayStr && !isRestDayLabel(w.day_label));
  if (past.length === 0) return null;
  const completed = past.filter((w) => w.status === 'completed').length;
  const skipped = past.filter((w) => w.status === 'skipped').length;
  const missed = countMissedWorkouts(planWorkouts, todayStr);
  return `Plan adherence (last 14d): ${completed} completed, ${skipped} skipped, ${missed} missed of ${past.length} scheduled`;
}

/** Load the runner profile and a recent-runs summary for AI detail generation and run review. */
export async function loadCoachContext(
  userId: string,
  history: CompletedWorkout[],
): Promise<CoachContext> {
  const { data: profile } = await supabase
    .from('running_profiles')
    .select('experience_level, typical_run_minutes, typical_run_minutes_max, easy_pace, fast_pace, race_times')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    profile: profile
      ? {
          experience_level: profile.experience_level ?? undefined,
          typical_run_minutes: profile.typical_run_minutes ?? undefined,
          typical_run_minutes_max: profile.typical_run_minutes_max ?? undefined,
          easy_pace: profile.easy_pace ?? undefined,
          fast_pace: profile.fast_pace ?? undefined,
          race_times: profile.race_times ?? undefined,
        }
      : undefined,
    historySummary: serializeHistorySummary(buildHistorySummary(history)),
  };
}

function withAdherence(context: CoachContext, planWorkouts: PlanWorkout[]): CoachContext {
  const adherence = describePlanAdherence(planWorkouts);
  if (!adherence) return context;
  return {
    ...context,
    historySummary: context.historySummary ? `${context.historySummary}\n${adherence}` : adherence,
  };
}

// ── Auto-fill upcoming workouts ─────────────────────────────

/** Number of days ahead to keep workouts detailed (rolling window). */
const DETAIL_WINDOW_DAYS = 14;

/**
 * Checks whether upcoming planned workouts within the next 14 days have workout_data.
 * If not, generates details for them, calibrated to the runner's profile, recent runs,
 * and plan adherence. Returns the updated workouts.
 * Safe to call repeatedly — no-ops if workouts already have detail.
 * `getContext` is only invoked when something actually needs generating.
 */
export async function ensureUpcomingWorkoutsDetailed(
  plan: TrainingPlan,
  allWorkouts: PlanWorkout[],
  getContext?: () => Promise<CoachContext>,
): Promise<PlanWorkout[]> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + DETAIL_WINDOW_DAYS);
  const windowEndStr = windowEnd.toISOString().split('T')[0];

  // Find planned non-rest workouts without workout_data within the 14-day window
  const needsDetail = allWorkouts
    .filter((w) =>
      w.status === 'planned' &&
      w.date >= todayStr &&
      w.date <= windowEndStr &&
      w.day_label !== 'Rest Day' &&
      !w.workout_data
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (needsDetail.length === 0) return allWorkouts;

  try {
    const baseContext = getContext
      ? await getContext().catch((err) => {
          console.warn('Failed to load coach context:', err);
          return {} as CoachContext;
        })
      : {};
    await generateWorkoutDetails(plan, needsDetail, withAdherence(baseContext, allWorkouts));

    // Re-fetch the updated workouts from the database
    const { data } = await supabase
      .from('plan_workouts')
      .select('*')
      .eq('plan_id', plan.id)
      .order('date');

    return (data ?? allWorkouts) as PlanWorkout[];
  } catch (err) {
    console.warn('Failed to auto-generate workout details:', err);
    return allWorkouts;
  }
}

// ── Plan Adjustment ─────────────────────────────────────────

export interface PlanAdjustmentInput {
  prompt: string;
  planSummary: {
    title: string;
    raceType: string;
    raceDate: string;
    goalType?: string;
    goalPace?: number | null;
    startDate: string;
    daysPerWeek: number;
    totalWeeks: number;
    workouts: {
      date: string;
      day_label: string;
      status: string;
      week_number: number;
    }[];
  };
  profile?: {
    experience_level?: string;
    typical_run_minutes?: number;
    typical_run_minutes_max?: number;
    easy_pace?: number;
    fast_pace?: number;
    race_times?: Record<string, { slow: number | null; avg: number | null; fast: number | null }> | null;
  };
  conversation?: { role: 'user' | 'assistant'; content: string }[];
  client?: AiClientMeta;
}

export async function adjustPlan(input: PlanAdjustmentInput): Promise<PlanAdjustmentResult> {
  const requestBody = {
    prompt: input.prompt,
    plan_summary: {
      title: input.planSummary.title,
      race_type: input.planSummary.raceType,
      race_date: input.planSummary.raceDate,
      goal_type: input.planSummary.goalType ?? 'race',
      goal_pace: input.planSummary.goalPace ?? null,
      start_date: input.planSummary.startDate,
      days_per_week: input.planSummary.daysPerWeek,
      total_weeks: input.planSummary.totalWeeks,
      workouts: input.planSummary.workouts,
    },
    profile: input.profile,
    conversation: input.conversation,
    client: input.client,
  };

  console.log('[adjustPlan] prompt:', input.prompt);
  console.log('[adjustPlan] workouts count:', input.planSummary.workouts.length);
  console.log('[adjustPlan] conversation length:', input.conversation?.length ?? 0);

  const { data, error } = await supabase.functions.invoke('adjust-plan', {
    body: requestBody,
  });

  if (error) {
    let message = 'Failed to adjust plan';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json().catch(() => null);
        if (body?.error) message = body.error;
      } else if (error.message) {
        message = error.message;
      }
    } catch {
      // ignore parse errors
    }
    console.error('[adjustPlan] error:', message);
    throw new Error(message);
  }

  if (data?.error) {
    console.error('[adjustPlan] data error:', data.error);
    throw new Error(data.error);
  }

  const result: PlanAdjustmentResult = {
    message: data.message,
    modifications: data.modifications,
    requestId: data.request_id,
  };
  console.log('[adjustPlan] response message:', result.message?.slice(0, 100));
  console.log('[adjustPlan] modifications count:', result.modifications?.length ?? 0);
  if (result.modifications?.length) {
    result.modifications.forEach((mod, i) => {
      console.log(`[adjustPlan] mod[${i}]:`, mod.date, mod.action, mod.day_label);
      if (mod.workout) {
        const blocks = mod.workout.blocks ?? [];
        const totalSec = blocks.reduce((sum: number, b: any) => {
          const rc = b.repeatCount ?? b.repeat ?? 1;
          const intSec = (b.intervals ?? []).reduce((s: number, int: any) => s + (int.durationSeconds ?? 0), 0);
          return sum + intSec * rc;
        }, 0);
        console.log(`[adjustPlan] mod[${i}] workout:`, mod.workout.name, `blocks=${blocks.length}`, `totalSec=${totalSec}`, `(${Math.round(totalSec / 60)}min)`);
      }
    });
  }

  return result;
}

// ── Post-run Review ─────────────────────────────────────────

export interface RunReviewResult {
  analysis: WorkoutAnalysis;
  /** Proposed changes, limited to upcoming planned days in the 14-day window. */
  adjustments: PlanModification[];
}

/**
 * Analyze a just-finished plan run against its prescription, the runner's recent
 * history, and plan adherence. Returns coach feedback plus any proposed changes
 * to upcoming workouts for the ModificationReview component.
 */
export async function reviewCompletedRun(input: {
  plannedWorkout: PlanWorkout;
  completedRun: CompletedWorkout;
  planWorkouts: PlanWorkout[];
  context: CoachContext;
}): Promise<RunReviewResult> {
  const { plannedWorkout, completedRun, planWorkouts, context } = input;
  const todayStr = localDateKey(new Date());
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + DETAIL_WINDOW_DAYS);
  const windowEndStr = localDateKey(windowEnd);

  const upcoming = planWorkouts
    .filter((w) =>
      w.id !== plannedWorkout.id &&
      w.status === 'planned' &&
      w.date > todayStr &&
      w.date <= windowEndStr &&
      !isRestDayLabel(w.day_label)
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const distance = completedRun.totalDistanceMeters ?? null;
  const averagePace = distance && distance > 0
    ? (completedRun.totalDurationMs / 60_000) / (distance / 1609.344)
    : null;

  const splits = (completedRun.splits ?? [])
    .filter((s) => s.avgPaceMinPerMile != null && isFinite(s.avgPaceMinPerMile) && s.distanceMeters)
    .map((s) => ({
      label: s.label,
      type: s.type,
      pace_min_per_mile: s.avgPaceMinPerMile!,
      distance_meters: s.distanceMeters!,
      target_pace: s.targetPace ?? null,
    }));

  const analysis = await analyzeCompletedWorkout({
    completed_workout: {
      name: completedRun.workoutName,
      total_duration_ms: completedRun.totalDurationMs,
      total_distance_meters: distance,
      splits: splits.length > 0 ? splits : undefined,
      average_pace_min_per_mile: averagePace,
    },
    planned_workout: {
      day_label: plannedWorkout.day_label ?? 'Training',
      description: plannedWorkout.description ?? undefined,
      workout_data: plannedWorkout.workout_data ?? undefined,
    },
    profile: context.profile
      ? {
          experience_level: context.profile.experience_level,
          easy_pace: context.profile.easy_pace,
          fast_pace: context.profile.fast_pace,
        }
      : null,
    recent_history_summary: withAdherence(context, planWorkouts).historySummary ?? null,
    today: todayStr,
    upcoming_workouts: upcoming.map((w) => ({
      date: w.date,
      day_label: w.day_label ?? 'Training',
      description: w.description,
    })),
    missed_workouts_last_14_days: countMissedWorkouts(planWorkouts, todayStr),
  });

  const allowedDates = new Set(upcoming.map((w) => w.date));
  const adjustments = analysis.plan_update?.requires_changes
    ? (analysis.plan_update.workout_changes ?? []).filter((c) => allowedDates.has(c.date))
    : [];

  return { analysis, adjustments };
}

// ── Workout Analysis ────────────────────────────────────────

export async function analyzeCompletedWorkout(
  input: WorkoutAnalysisInput,
): Promise<WorkoutAnalysis> {
  const { data, error } = await supabase.functions.invoke('analyze-workout', {
    body: input,
  });

  if (error) {
    throw new Error(await extractFunctionError(error, 'Failed to analyze workout'));
  }
  if (data?.error) {
    throw new Error(data.error);
  }

  return data as WorkoutAnalysis;
}

// ── CRUD Operations ─────────────────────────────────────────

/**
 * Save a newly generated plan outline and its skeleton workouts to Supabase.
 * Workouts are saved WITHOUT workout_data — detail is generated on demand.
 */
export async function savePlanOutline(
  userId: string,
  input: PlanGenerationInput,
  result: PlanOutlineResult,
): Promise<{ plan: TrainingPlan; workouts: PlanWorkout[] }> {
  // Insert the plan with outline stored for future detail generation context
  const { data: planData, error: planError } = await supabase
    .from('training_plans')
    .insert({
      user_id: userId,
      title: result.title,
      race_type: input.raceType,
      race_distance_meters: input.raceType === 'custom' ? (input.customDistanceMeters ?? null) : getRaceDistanceMeters(input.raceType),
      race_date: input.raceDate,
      goal_time_minutes: input.goalTimeMinutes ?? null,
      goal_type: input.goalType ?? 'race',
      goal_pace: input.goalPace ?? result.suggested_goal_pace ?? null,
      start_date: input.startDate,
      days_per_week: input.daysPerWeek,
      outline: result.weeks,
      approach: result.approach ?? null,
      phases: result.phases ?? null,
      status: 'active',
    })
    .select()
    .single();

  if (planError || !planData) {
    throw new Error(planError?.message || 'Failed to save plan');
  }

  // Flatten all days from outline weeks into plan_workout rows (no workout_data)
  const workoutRows = result.weeks.flatMap((week) =>
    week.days.map((day) => ({
      plan_id: planData.id,
      user_id: userId,
      date: day.date,
      week_number: week.week_number,
      day_label: day.day_label,
      description: day.description,
      workout_data: null,
      status: 'planned' as const,
    }))
  );

  const { data: workoutData, error: workoutError } = await supabase
    .from('plan_workouts')
    .insert(workoutRows)
    .select();

  if (workoutError) {
    throw new Error(workoutError.message);
  }

  return {
    plan: planData as TrainingPlan,
    workouts: (workoutData ?? []) as PlanWorkout[],
  };
}

/** Load the user's active training plan (first non-custom, for backward compat). */
export async function loadActivePlan(userId: string): Promise<TrainingPlan | null> {
  const plans = await loadActivePlans(userId);
  return plans.find((p) => p.race_type !== 'custom') ?? plans[0] ?? null;
}

/** Load ALL active training plans for a user. */
export async function loadActivePlans(userId: string): Promise<TrainingPlan[]> {
  const { data, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load active plans: ${error.message}`);

  return (data ?? []) as TrainingPlan[];
}

/** Migrate workout_data on each PlanWorkout from old to new block model. */
function migratePlanWorkoutData(workouts: PlanWorkout[]): PlanWorkout[] {
  return workouts.map((pw) => {
    if (pw.workout_data && typeof pw.workout_data === 'object') {
      return { ...pw, workout_data: migrateToBlockModel(pw.workout_data) };
    }
    return pw;
  });
}

/** Load all workouts for a given plan. */
export async function loadPlanWorkouts(planId: string): Promise<PlanWorkout[]> {
  const { data, error } = await supabase
    .from('plan_workouts')
    .select('*')
    .eq('plan_id', planId)
    .order('date');

  if (error) {
    console.warn('Failed to load plan workouts:', error);
    return [];
  }

  return migratePlanWorkoutData((data ?? []) as PlanWorkout[]);
}

/** Load all plan workouts for a user across all plans (active + archived). */
export async function loadUserPlanWorkouts(userId: string): Promise<PlanWorkout[]> {
  const { data, error } = await supabase
    .from('plan_workouts')
    .select('*')
    .eq('user_id', userId)
    .order('date');

  if (error) throw new Error(`Failed to load user plan workouts: ${error.message}`);

  return migratePlanWorkoutData((data ?? []) as PlanWorkout[]);
}

/**
 * Ensure the user has an active plan — returns the existing one, or
 * creates a lightweight "custom" plan so workouts can be scheduled on
 * the calendar without going through the AI plan builder.
 */
export async function ensureCustomPlan(userId: string): Promise<TrainingPlan> {
  // Look for an existing custom plan (not race plans) to attach manual workouts to
  const plans = await loadActivePlans(userId);
  const existing = plans.find((p) => p.race_type === 'custom');
  if (existing) return existing;

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('training_plans')
    .insert({
      user_id: userId,
      title: 'My Training Calendar',
      race_type: 'custom',
      race_date: today,
      goal_type: 'race',
      start_date: today,
      days_per_week: 5,
      status: 'active',
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create calendar plan');
  }

  return data as TrainingPlan;
}

/** Load plan workouts within a date range (for calendar views). */
export async function loadPlanWorkoutsInRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<PlanWorkout[]> {
  const { data, error } = await supabase
    .from('plan_workouts')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');

  if (error) {
    console.warn('Failed to load plan workouts in range:', error);
    return [];
  }

  return migratePlanWorkoutData((data ?? []) as PlanWorkout[]);
}

/** Mark a plan workout as completed and link to the completed workout. */
export async function completePlanWorkout(
  workoutId: string,
  completedWorkoutId: string,
): Promise<void> {
  const { error } = await supabase
    .from('plan_workouts')
    .update({
      status: 'completed',
      completed_workout_id: completedWorkoutId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workoutId);

  if (error) {
    console.warn('Failed to complete plan workout:', error);
  }
}

/** Move a plan workout to a different date, recalculating week_number. */
export async function movePlanWorkout(
  workoutId: string,
  newDate: string,
  planStartDate: string,
): Promise<void> {
  const start = new Date(planStartDate);
  const target = new Date(newDate);
  const diffMs = target.getTime() - start.getTime();
  const weekNumber = Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));

  const { error } = await supabase
    .from('plan_workouts')
    .update({
      date: newDate,
      week_number: weekNumber,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workoutId);

  if (error) {
    throw new Error(error.message);
  }
}

/** Replace the workout definition (and optionally the label) of a plan workout. */
export async function updatePlanWorkoutData(
  workoutId: string,
  workoutData: import('../workout/workoutTypes').WorkoutDefinition,
  dayLabel?: string,
): Promise<void> {
  const { error } = await supabase
    .from('plan_workouts')
    .update({
      workout_data: workoutData,
      ...(dayLabel !== undefined ? { day_label: dayLabel } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', workoutId);

  if (error) {
    throw new Error(error.message);
  }
}

/** Remove a plan workout from the calendar entirely. */
export async function removePlanWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase
    .from('plan_workouts')
    .delete()
    .eq('id', workoutId);

  if (error) {
    throw new Error(error.message);
  }
}

/** Apply modifications from the adjust-plan edge function. */
export async function applyPlanModifications(
  planId: string,
  modifications: PlanModification[],
): Promise<void> {
  console.log('[applyMods] planId:', planId, 'modifications:', modifications.length);

  // Fetch plan metadata to get user_id and start_date for new rows
  const { data: planRow, error: planError } = await supabase
    .from('training_plans')
    .select('user_id, start_date')
    .eq('id', planId)
    .single();

  if (planError) {
    console.error('[applyMods] Failed to fetch plan:', planError.message);
  }

  const userId = planRow?.user_id ?? '';
  const planStartDate = planRow?.start_date ?? '';
  console.log('[applyMods] userId:', userId, 'planStartDate:', planStartDate);

  await Promise.all(
    modifications.map(async (mod) => {
      console.log(`[applyMods] Processing: ${mod.action} on ${mod.date} (label: ${mod.day_label})`);

      if (mod.action === 'skip') {
        const { error: skipErr, count } = await supabase
          .from('plan_workouts')
          .update({
            status: 'skipped',
            updated_at: new Date().toISOString(),
          })
          .eq('plan_id', planId)
          .eq('date', mod.date);

        console.log(`[applyMods] skip result: count=${count}, error=${skipErr?.message ?? 'none'}`);
        return;
      }

      if (mod.action === 'update') {
        const workoutData = mod.workout
          ? migrateToBlockModel({
              id: generateId(),
              name: mod.workout.name,
              category: parseWorkoutCategory(mod.workout.category),
              warmup: mod.workout.warmup ?? [],
              blocks: mod.workout.blocks ?? [],
              cooldown: mod.workout.cooldown ?? [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
          : null;
        if (workoutData) workoutData.blocks = workoutData.blocks.map(sanitizeBlock);

        console.log(`[applyMods] workout data:`, workoutData ? `name=${workoutData.name}, blocks=${workoutData.blocks.length}` : 'null');

        // Try updating the existing row first
        const { data: updated, error: updateErr } = await supabase
          .from('plan_workouts')
          .update({
            day_label: mod.day_label ?? undefined,
            description: mod.description ?? undefined,
            workout_data: workoutData,
            updated_at: new Date().toISOString(),
          })
          .eq('plan_id', planId)
          .eq('date', mod.date)
          .select('id');

        console.log(`[applyMods] update result: matched=${updated?.length ?? 0}, error=${updateErr?.message ?? 'none'}`);

        // If no existing row matched, insert a new one
        if (!updated || updated.length === 0) {
          const weekNumber = planStartDate
            ? Math.max(1, Math.ceil(
                (new Date(mod.date).getTime() - new Date(planStartDate).getTime()) /
                (7 * 24 * 60 * 60 * 1000)
              ))
            : 1;

          console.log(`[applyMods] No existing row for ${mod.date}, inserting new row (week ${weekNumber})`);

          const { error: insertErr } = await supabase
            .from('plan_workouts')
            .insert({
              plan_id: planId,
              user_id: userId,
              date: mod.date,
              week_number: weekNumber,
              day_label: mod.day_label ?? 'Training',
              description: mod.description ?? null,
              workout_data: workoutData,
              status: 'planned',
            });

          if (insertErr) {
            console.error(`[applyMods] Insert failed:`, insertErr.message);
          } else {
            console.log(`[applyMods] Inserted new row for ${mod.date}`);
          }
        }
      }
    })
  );

  console.log('[applyMods] All modifications applied');
}

/** Add a custom workout to the plan calendar on a specific date. */
export async function addWorkoutToCalendar(
  planId: string,
  userId: string,
  date: string,
  workout: import('../workout/workoutTypes').WorkoutDefinition,
  startDate: string,
): Promise<PlanWorkout> {
  const start = new Date(startDate);
  const target = new Date(date);
  const diffMs = target.getTime() - start.getTime();
  const weekNumber = Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));

  const { data, error } = await supabase
    .from('plan_workouts')
    .insert({
      plan_id: planId,
      user_id: userId,
      date,
      week_number: weekNumber,
      day_label: workout.name,
      description: 'Custom workout added to calendar',
      workout_data: {
        id: workout.id,
        name: workout.name,
        category: workout.category,
        origin: workout.origin,
        blocks: workout.blocks ?? [],
        targetDistanceMeters: workout.targetDistanceMeters ?? null,
        createdAt: workout.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      },
      status: 'planned' as const,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to add workout to calendar');
  }

  return data as PlanWorkout;
}

/** Archive (soft-delete) a plan. */
export async function archivePlan(planId: string): Promise<void> {
  const { error } = await supabase
    .from('training_plans')
    .update({
      status: 'archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (error) {
    throw new Error(error.message);
  }
}

/** Restore an archived plan back to active. */
export async function restorePlan(planId: string): Promise<void> {
  const { error } = await supabase
    .from('training_plans')
    .update({
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (error) {
    throw new Error(error.message);
  }
}

/** Load all archived training plans for a user. */
export async function loadArchivedPlans(userId: string): Promise<TrainingPlan[]> {
  const { data, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'archived')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Failed to load archived plans: ${error.message}`);

  return (data ?? []) as TrainingPlan[];
}

/** Days a deleted plan stays recoverable before the server purges it. */
export const DELETED_PLAN_RETENTION_DAYS = 30;

/** Move an archived plan to Recently Deleted. It is purged permanently after the retention window. */
export async function deletePlan(planId: string): Promise<string> {
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from('training_plans')
    .update({
      status: 'deleted',
      deleted_at: deletedAt,
      updated_at: deletedAt,
    })
    .eq('id', planId)
    .eq('status', 'archived');

  if (error) {
    throw new Error(error.message);
  }
  return deletedAt;
}

/** Recover a deleted plan back to the archived list. */
export async function restoreDeletedPlan(planId: string): Promise<void> {
  const { error } = await supabase
    .from('training_plans')
    .update({
      status: 'archived',
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId)
    .eq('status', 'deleted');

  if (error) {
    throw new Error(error.message);
  }
}

/** Load plans that are deleted but still inside the recovery window. */
export async function loadDeletedPlans(userId: string): Promise<TrainingPlan[]> {
  const { data, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'deleted')
    .order('deleted_at', { ascending: false });

  if (error) throw new Error(`Failed to load deleted plans: ${error.message}`);

  return (data ?? []) as TrainingPlan[];
}

/** Update mutable fields on a training plan (e.g. race_date, days_per_week). */
export async function updateTrainingPlan(
  planId: string,
  fields: Partial<Pick<TrainingPlan, 'race_date' | 'days_per_week' | 'title' | 'goal_time_minutes' | 'goal_pace'>>,
): Promise<void> {
  const { error } = await supabase
    .from('training_plans')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (error) {
    throw new Error(error.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────

function getRaceDistanceMeters(raceType: RaceType): number | null {
  switch (raceType) {
    case '5k': return 5000;
    case '10k': return 10000;
    case 'half_marathon': return 21097;
    case 'marathon': return 42195;
    default: return null;
  }
}
