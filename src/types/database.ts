/**
 * Database types for SplitCue cloud features.
 *
 * These mirror the Supabase tables defined in SETUP.md.
 */

// ── Subscription ─────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'pro';
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'canceled'
  | 'expired'
  | 'past_due';
export type SubscriptionProvider = 'apple' | 'stripe' | 'manual';

export type Subscription = {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  provider: SubscriptionProvider | null;
  provider_subscription_id: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
};

// ── Profile ──────────────────────────────────────────────────

export type Profile = {
  id: string;
  display_name: string | null;
  ai_workouts_this_month: number;
  created_at: string;
  updated_at: string;
};

// ── Running Profile / Preferences ────────────────────────────

export type RunningPreferenceCategory =
  | 'goal'
  | 'preference'
  | 'general'
  | 'limitation';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/** Per-distance benchmark: slow / avg / fast in total seconds. */
export type RaceTimeEntry = {
  slow: number | null;
  avg: number | null;
  fast: number | null;
};

/** Keys are distance identifiers: mile, 5k, 10k, half_marathon, marathon. */
export type RaceTimes = Record<string, RaceTimeEntry>;

/** A single day in the user's weekly schedule. `locked` = must train; flexible = prefers but can move. */
export type DayPreference = {
  day: string;   // 'monday' | 'tuesday' | … | 'sunday'
  locked: boolean;
};

/**
 * Normalize legacy `string[]` format into `DayPreference[]`.
 * Old data: `['monday','friday']` → `[{day:'monday',locked:false},{day:'friday',locked:false}]`
 */
export function normalizeDayPreferences(raw: unknown): DayPreference[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((item: unknown) => {
    if (typeof item === 'string') return { day: item, locked: false };
    const obj = item as Record<string, unknown>;
    return { day: String(obj.day ?? ''), locked: Boolean(obj.locked) };
  });
}

export type RunningProfile = {
  id: string;
  user_id: string;
  experience_level: ExperienceLevel;
  typical_run_minutes: number | null; // e.g. 30 (range lower bound)
  typical_run_minutes_max: number | null; // e.g. 60 (range upper bound)
  easy_pace: number | null; // min/mile e.g. 10.0
  fast_pace: number | null; // min/mile e.g. 7.5
  race_times: RaceTimes | null;
  weekly_mileage: number | null; // typical miles per week
  longest_recent_run_minutes: number | null; // longest run in recent weeks
  max_workout_minutes: number | null; // maximum single workout duration
  preferred_days: DayPreference[] | null; // e.g. [{day:'monday',locked:true},{day:'friday',locked:false}]
  cross_training: string[] | null; // e.g. ['strength','cycling','yoga']
  created_at: string;
  updated_at: string;
};

export type RunningPreference = {
  id: string;
  user_id: string;
  content: string;
  category: RunningPreferenceCategory;
  created_at: string;
};

// ── AI Generations ───────────────────────────────────────────

export type AIGeneration = {
  id: string;
  user_id: string;
  prompt: string;
  result: unknown | null;
  created_at: string;
};

// ── Training Plans ───────────────────────────────────────────

export type RaceType = '5k' | '10k' | 'half_marathon' | 'marathon' | 'custom';
export type GoalType = 'race' | 'pace_target';
export type PlanStatus = 'active' | 'completed' | 'archived' | 'deleted';
export type PlanWorkoutStatus = 'planned' | 'completed' | 'skipped';

/** Week-level outline stored on the plan for context when generating workout details. */
export type PlanOutlineWeek = {
  week_number: number;
  theme: string;
  total_miles_target: number;
  days: {
    date: string;
    day_label: string;
    description: string | null;
  }[];
};

export type PlanPhase = {
  start_week: number;
  end_week: number;
  name: string;
  focus: string;
};

export type TrainingPlan = {
  id: string;
  user_id: string;
  title: string;
  race_type: RaceType;
  race_distance_meters: number | null;
  race_date: string; // ISO date string YYYY-MM-DD — also used as target date for pace_target plans
  goal_time_minutes: number | null;
  goal_type: GoalType; // 'race' (default) or 'pace_target'
  goal_pace: number | null; // target pace in min/mile decimal (e.g. 8.5 = 8:30/mi)
  start_date: string; // ISO date string YYYY-MM-DD
  days_per_week: number;
  outline: PlanOutlineWeek[] | null;
  /** Coach's high-level description of the plan strategy. Null for older and custom plans. */
  approach: string | null;
  phases: PlanPhase[] | null;
  status: PlanStatus;
  /** Set when status is 'deleted'; the plan is purged permanently 30 days later. */
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanWorkout = {
  id: string;
  plan_id: string;
  user_id: string;
  date: string; // ISO date string YYYY-MM-DD
  week_number: number;
  day_label: string | null;
  description: string | null;
  workout_data: unknown | null; // WorkoutDefinition JSON when present
  status: PlanWorkoutStatus;
  completed_workout_id: string | null;
  created_at: string;
  updated_at: string;
};

// ── Push notifications ───────────────────────────────────────

export type PushPlatform = 'ios' | 'android';
export type PushEnvironment = 'development' | 'preview' | 'production';

export type PushToken = {
  id: string;
  token: string;
  anonymous_user_id: string | null;
  user_id: string | null;
  platform: PushPlatform;
  environment: PushEnvironment;
  app_version: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

export type PushSendTicket = {
  token: string;
  ticketId: string | null;
  status: 'ok' | 'error';
  error: string | null;
};

export type PushSend = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  environments: string[];
  recipient_count: number;
  error_count: number;
  tickets: PushSendTicket[];
  created_at: string;
  receipts_checked_at: string | null;
};