import { createServiceClient } from './supabase-server';

export type OverviewStats = {
  totalUsers: number;
  dauToday: number;
  wau: number;
  proSubscribers: number;
};

export type EngagementStats = {
  activationRate: number;
  coreEngagementRate: number;
  freeToPaidRate: number;
};

export type WorkoutCompletionStats = {
  startedToday: number;
  completedToday: number;
  startedPeriod: number;
  completedPeriod: number;
  completionRate: number;
};

export type FunnelStep = {
  step: string;
  user_count: number;
  pct: number;
};

export type AIAdoptionStats = {
  aiUsers: number;
  aiUsersCompleted: number;
  adoptionRate: number;
};

export type TrainingPlanStats = {
  generated: number;
  stillActive: number;
  archived: number;
  started: number;
  failed: number;
  uniqueUsers: number;
  startRate: number;
};

export type DailyCount = {
  date: string;
  count: number;
};

export type DailyWorkoutCount = {
  date: string;
  started: number;
  completed: number;
};

export type UserEventBreakdown = {
  anonymous_user_id: string;
  display_name: string;
  event_count: number;
  events: string[];
};

export type RetentionCurvePoint = {
  cohort: string;
  workout_number: number;
  user_count: number;
  pct: number;
};

export type CountryCount = {
  country: string;
  user_count: number;
};

export type CountryPlatformCount = {
  country: string;
  platform: 'ios' | 'android' | 'unknown';
  user_count: number;
};

export type AppVersionCount = {
  app_version: string;
  user_count: number;
};

export type TrainingPlanUserBreakdown = {
  user_id: string;
  display_name: string;
  plan_count: number;
  accepted_count: number;
  latest_at: string;
};

export type StravaStats = {
  connectedUsers: number;
  connectedPct: number;
  newConnections: number;
  disconnects: number;
  pushes: number;
  autoPushes: number;
  uniquePushers: number;
};

export type StravaUser = {
  user_id: string;
  display_name: string;
  athlete_name: string | null;
  is_connected: boolean;
  connected_at: string | null;
  push_count: number;
  pushes_period: number;
  auto_push_count: number;
  latest_push_at: string | null;
};

/**
 * Fetch all overview metrics in parallel.
 */
export async function getOverviewStats(): Promise<OverviewStats> {
  const supabase = createServiceClient();

  const [
    totalUsersRes,
    dauRes,
    wauRes,
    proSubsRes,
  ] = await Promise.all([
    supabase.rpc('total_users'),
    supabase.rpc('dau_today'),
    supabase.rpc('wau'),
    supabase.rpc('pro_subscribers'),
  ]);

  return {
    totalUsers: (totalUsersRes.data as number) ?? 0,
    dauToday: (dauRes.data as number) ?? 0,
    wau: (wauRes.data as number) ?? 0,
    proSubscribers: (proSubsRes.data as number) ?? 0,
  };
}

/**
 * Fetch engagement / conversion metrics.
 */
export async function getEngagementStats(): Promise<EngagementStats> {
  const supabase = createServiceClient();

  const [activationRes, engagementRes, conversionRes] =
    await Promise.all([
      supabase.rpc('activation_rate'),
      supabase.rpc('core_engagement_rate'),
      supabase.rpc('free_to_paid_rate'),
    ]);

  return {
    activationRate: (activationRes.data as number) ?? 0,
    coreEngagementRate: (engagementRes.data as number) ?? 0,
    freeToPaidRate: (conversionRes.data as number) ?? 0,
  };
}

/**
 * Workout started/completed stats (today + last 7 days).
 */
export async function getWorkoutCompletionStats(): Promise<WorkoutCompletionStats> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('workout_completion_stats', { num_days: 7 });
  const row = Array.isArray(data) ? data[0] : data;
  return {
    startedToday: row?.started_today ?? 0,
    completedToday: row?.completed_today ?? 0,
    startedPeriod: row?.started_period ?? 0,
    completedPeriod: row?.completed_period ?? 0,
    completionRate: row?.completion_rate ?? 0,
  };
}

/**
 * Onboarding funnel (last N days).
 */
export async function getOnboardingFunnel(days = 30): Promise<FunnelStep[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('onboarding_funnel', { num_days: days });
  return (data as FunnelStep[]) ?? [];
}

/**
 * AI workout plan adoption rate (last N days).
 */
export async function getAIAdoptionRate(days = 30): Promise<AIAdoptionStats> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('ai_adoption_rate', { num_days: days });
  const row = Array.isArray(data) ? data[0] : data;
  return {
    aiUsers: row?.ai_users ?? 0,
    aiUsersCompleted: row?.ai_users_completed ?? 0,
    adoptionRate: row?.adoption_rate ?? 0,
  };
}

/**
 * AI training plans generated vs started (last N days).
 */
export async function getTrainingPlanStats(days = 30): Promise<TrainingPlanStats> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('training_plan_stats', { num_days: days });
  const row = Array.isArray(data) ? data[0] : data;
  return {
    generated: row?.generated ?? 0,
    stillActive: row?.still_active ?? 0,
    archived: row?.archived ?? 0,
    started: row?.accepted ?? 0,
    failed: row?.failed ?? 0,
    uniqueUsers: row?.unique_users ?? 0,
    startRate: row?.acceptance_rate ?? 0,
  };
}

/**
 * Workouts started and completed per day (last N days).
 */
export async function getWorkoutsOverTime(days = 30): Promise<DailyWorkoutCount[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('workouts_per_day', { num_days: days });
  return (data as DailyWorkoutCount[]) ?? [];
}

/**
 * DAU per day for the last N days.
 */
export async function getDAUOverTime(days = 30): Promise<DailyCount[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('dau_per_day', { num_days: days });
  return (data as DailyCount[]) ?? [];
}

/**
 * Signups per day for the last N days.
 */
export async function getSignupsOverTime(days = 30): Promise<DailyCount[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('signups_per_day', { num_days: days });
  return (data as DailyCount[]) ?? [];
}

/**
 * Event count per day for the last N days.
 */
export async function getEventsOverTime(days = 30): Promise<DailyCount[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('events_per_day', { num_days: days });
  return (data as DailyCount[]) ?? [];
}

/**
 * Unique devices by country and platform for the last N days.
 * Devices whose latest open came from a build without country or platform
 * tracking report that field as "unknown".
 */
export async function getUsersByCountryPlatform(days = 30): Promise<CountryPlatformCount[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('users_by_country_platform', { num_days: days });
  return (data as CountryPlatformCount[]) ?? [];
}

/**
 * Unique devices by app version for the last N days, newest version first.
 * Each device is counted once, using the version from its latest app open.
 */
export async function getUsersByAppVersion(days = 30): Promise<AppVersionCount[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('users_by_app_version', { num_days: days });
  const rows = (data as AppVersionCount[]) ?? [];
  return rows.sort((a, b) => {
    if (a.app_version === 'unknown') return 1;
    if (b.app_version === 'unknown') return -1;
    return b.app_version.localeCompare(a.app_version, undefined, { numeric: true });
  });
}

/**
 * Today's events broken down by anonymous user.
 */
export async function getTodaysEventsByUser(): Promise<UserEventBreakdown[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('todays_events_by_user');
  return (data as UserEventBreakdown[]) ?? [];
}

/**
 * AI training plans broken down by user (last N days).
 */
export async function getTrainingPlansByUser(days = 30): Promise<TrainingPlanUserBreakdown[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('training_plans_by_user', { num_days: days });
  return (data as TrainingPlanUserBreakdown[]) ?? [];
}

/**
 * Workout retention curve: of users who completed 1 workout, what %
 * completed a 2nd, 3rd, 4th, 5th — cohorted by month of first completion.
 */
export async function getWorkoutRetentionCurve(months = 6): Promise<RetentionCurvePoint[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('workout_retention_curve', { num_months: months });
  return (data as RetentionCurvePoint[]) ?? [];
}

/**
 * Strava connections (current) and push activity (last N days).
 */
export async function getStravaStats(days = 30): Promise<StravaStats> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('strava_stats', { num_days: days });
  const row = Array.isArray(data) ? data[0] : data;
  return {
    connectedUsers: row?.connected_users ?? 0,
    connectedPct: row?.connected_pct ?? 0,
    newConnections: row?.new_connections ?? 0,
    disconnects: row?.disconnects ?? 0,
    pushes: row?.pushes ?? 0,
    autoPushes: row?.auto_pushes ?? 0,
    uniquePushers: row?.unique_pushers ?? 0,
  };
}

/**
 * Users connected to Strava or who have pushed a workout, most pushes first.
 */
export async function getStravaUsers(days = 30): Promise<StravaUser[]> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('strava_users', { num_days: days });
  return (data as StravaUser[]) ?? [];
}
