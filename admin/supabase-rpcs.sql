-- ── Account Deletion (called by the client) ─────────────────
-- Allows the authenticated user to delete their own account.
-- All user data cascades automatically via ON DELETE CASCADE FKs
-- on profiles, running_profiles, running_preferences, subscriptions,
-- ai_generations, ai_conversations, cloud_workouts, and cloud_history.

create or replace function delete_own_account()
returns void as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$ language plpgsql security definer;

-- ── Events table: add optional user_id column ───────────────
-- Links anonymous events to authenticated users when logged in.
-- Nullable so existing rows and anonymous events are unaffected.

alter table events add column if not exists user_id uuid references auth.users on delete set null;
create index if not exists idx_events_user_id on events(user_id) where user_id is not null;

-- Device region (ISO 3166-1 alpha-2) recorded with each analytics event.
alter table events add column if not exists country text;

-- ── Admin Dashboard RPC Functions ────────────────────────────
-- Run these in the Supabase SQL Editor to support the admin dashboard.
-- These use security definer so they bypass RLS and return correct counts.
--
-- Drop functions whose return types may have changed, so CREATE OR REPLACE
-- doesn't error. Safe to run repeatedly.
drop function if exists todays_events_by_user();
drop function if exists ai_generations_by_user(int);
drop function if exists dau_per_day(int);
drop function if exists signups_per_day(int);
drop function if exists events_per_day(int);
drop function if exists workouts_per_day(int);
drop function if exists onboarding_funnel(int);
drop function if exists workout_completion_stats(int);
drop function if exists ai_adoption_rate(int);
drop function if exists users_by_country(int);
drop function if exists users_by_app_version(int);
drop function if exists training_plan_stats(int);
drop function if exists training_plans_by_user(int);

-- Total registered users
create or replace function total_users()
returns int as $$
  select count(*)::int from profiles;
$$ language sql security definer;

-- New users in the last N days
create or replace function new_users(num_days int default 7)
returns int as $$
  select count(*)::int
  from profiles
  where created_at > now() - (num_days || ' days')::interval;
$$ language sql security definer;

-- DAU: distinct anonymous users who opened the app today
create or replace function dau_today()
returns int as $$
  select count(distinct anonymous_user_id)::int
  from events
  where event_name = 'app_opened'
    and created_at::date = current_date;
$$ language sql security definer;

-- Active pro subscribers (active or trialing)
create or replace function pro_subscribers()
returns int as $$
  select count(*)::int
  from subscriptions
  where tier = 'pro' and status in ('active', 'trialing');
$$ language sql security definer;

-- AI generations in the last N days
create or replace function ai_generations_count(num_days int default 7)
returns int as $$
  select count(*)::int
  from ai_generations
  where created_at > now() - (num_days || ' days')::interval;
$$ language sql security definer;

-- WAU: distinct anonymous users who opened the app in the last 7 days
create or replace function wau()
returns int as $$
  select count(distinct anonymous_user_id)::int
  from events
  where event_name = 'app_opened'
    and created_at > now() - interval '7 days';
$$ language sql security definer;

-- Activation Rate: % of users signed up in last 30d who completed >= 1 workout
-- Uses cloud_history (requires auth) as the activation signal.
create or replace function activation_rate()
returns numeric as $$
  select
    case
      when count(*) = 0 then 0
      else round(
        count(*) filter (where exists (
          select 1 from cloud_history ch
          where ch.user_id = p.id and ch.deleted_at is null
        ))::numeric / count(*)::numeric * 100,
        1
      )
    end
  from profiles p
  where p.created_at > now() - interval '30 days';
$$ language sql security definer;

-- Week 4 Retention: % of users who signed up 22-28 days ago
-- that completed a workout in the last 7 days.
create or replace function week4_retention()
returns numeric as $$
  select
    case
      when count(*) = 0 then 0
      else round(
        count(*) filter (where exists (
          select 1 from cloud_history ch
          where ch.user_id = p.id
            and ch.deleted_at is null
            and ch.completed_at > now() - interval '7 days'
        ))::numeric / count(*)::numeric * 100,
        1
      )
    end
  from profiles p
  where p.created_at between now() - interval '28 days'
                        and now() - interval '21 days';
$$ language sql security definer;

-- Core Feature Engagement: % of WAU who started or completed a workout
create or replace function core_engagement_rate()
returns numeric as $$
  with wau_users as (
    select count(distinct anonymous_user_id) as total
    from events
    where event_name = 'app_opened'
      and created_at > now() - interval '7 days'
  ),
  engaged_users as (
    select count(distinct anonymous_user_id) as total
    from events
    where event_name in ('workout_started', 'workout_completed')
      and created_at > now() - interval '7 days'
  )
  select
    case
      when wau_users.total = 0 then 0
      else round(engaged_users.total::numeric / wau_users.total::numeric * 100, 1)
    end
  from wau_users, engaged_users;
$$ language sql security definer;

-- Free-to-Paid Conversion: % of all registered users who have a pro subscription
create or replace function free_to_paid_rate()
returns numeric as $$
  with total as (
    select count(*) as n from profiles
  ),
  paid as (
    select count(*) as n
    from subscriptions
    where tier = 'pro' and status in ('active', 'trialing')
  )
  select
    case
      when total.n = 0 then 0
      else round(paid.n::numeric / total.n::numeric * 100, 1)
    end
  from total, paid;
$$ language sql security definer;

-- Today's events broken down by anonymous user: who is generating the traffic?
-- Resolves to display name or email when user_id is available.
create or replace function todays_events_by_user()
returns table(
  anonymous_user_id text,
  display_name text,
  event_count int,
  events jsonb
) as $$
  select
    e.anonymous_user_id,
    coalesce(
      max(p.display_name),
      max(u.email),
      e.anonymous_user_id
    ) as display_name,
    count(*)::int as event_count,
    jsonb_agg(distinct e.event_name order by e.event_name) as events
  from events e
  left join auth.users u on u.id = e.user_id
  left join profiles p on p.id = e.user_id
  where e.created_at::date = current_date
  group by e.anonymous_user_id
  order by event_count desc;
$$ language sql security definer;

-- AI generations broken down by user (last N days)
-- Joins profiles to show display name / email where available.
create or replace function ai_generations_by_user(num_days int default 7)
returns table(
  user_id uuid,
  display_name text,
  generation_count int,
  latest_at timestamptz
) as $$
  select
    ag.user_id,
    coalesce(p.display_name, u.email, ag.user_id::text) as display_name,
    count(*)::int as generation_count,
    max(ag.created_at) as latest_at
  from ai_generations ag
  left join profiles p on p.id = ag.user_id
  left join auth.users u on u.id = ag.user_id
  where ag.created_at > now() - (num_days || ' days')::interval
  group by ag.user_id, p.display_name, u.email
  order by generation_count desc;
$$ language sql security definer;

-- AI training plans broken down by user (last N days).
-- Excludes the 'custom' calendar plans created for manually scheduled workouts.
-- accepted_count matches training_plan_stats: >= 1 plan workout completed.
-- The dashboard labels this "started"; there is no accept step in the app.
create or replace function training_plans_by_user(num_days int default 30)
returns table(
  user_id uuid,
  display_name text,
  plan_count int,
  accepted_count int,
  latest_at timestamptz
) as $$
  select
    tp.user_id,
    coalesce(p.display_name, u.email, tp.user_id::text) as display_name,
    count(*)::int as plan_count,
    count(*) filter (where exists (
      select 1 from plan_workouts pw
      where pw.plan_id = tp.id and pw.status = 'completed'
    ))::int as accepted_count,
    max(tp.created_at) as latest_at
  from training_plans tp
  left join profiles p on p.id = tp.user_id
  left join auth.users u on u.id = tp.user_id
  where tp.race_type <> 'custom'
    and tp.created_at > now() - (num_days || ' days')::interval
  group by tp.user_id, p.display_name, u.email
  order by plan_count desc, latest_at desc;
$$ language sql security definer;

-- Workout started vs completed stats (today + last 7 days)
create or replace function workout_completion_stats(num_days int default 7)
returns table(
  started_today int,
  completed_today int,
  started_period int,
  completed_period int,
  completion_rate numeric
) as $$
  with counts as (
    select
      count(*) filter (
        where event_name = 'workout_started' and created_at::date = current_date
      )::int as started_today,
      count(*) filter (
        where event_name = 'workout_completed' and created_at::date = current_date
      )::int as completed_today,
      count(*) filter (
        where event_name = 'workout_started'
          and created_at > now() - (num_days || ' days')::interval
      )::int as started_period,
      count(*) filter (
        where event_name = 'workout_completed'
          and created_at > now() - (num_days || ' days')::interval
      )::int as completed_period
    from events
    where event_name in ('workout_started', 'workout_completed')
  )
  select
    started_today,
    completed_today,
    started_period,
    completed_period,
    case
      when started_period = 0 then 0
      else round(completed_period::numeric / started_period::numeric * 100, 1)
    end as completion_rate
  from counts;
$$ language sql security definer;

-- Workouts started and completed per day (overlaid chart)
create or replace function workouts_per_day(num_days int default 30)
returns table(date text, started int, completed int) as $$
  select
    to_char(d.day, 'YYYY-MM-DD') as date,
    coalesce(count(*) filter (where e.event_name = 'workout_started'), 0)::int as started,
    coalesce(count(*) filter (where e.event_name = 'workout_completed'), 0)::int as completed
  from generate_series(
    current_date - (num_days - 1),
    current_date,
    '1 day'::interval
  ) as d(day)
  left join events e
    on e.created_at::date = d.day
    and e.event_name in ('workout_started', 'workout_completed')
  group by d.day
  order by d.day;
$$ language sql security definer;

-- Onboarding funnel: % of users at each step (last N days)
-- Tracks: app_opened → workout_saved/workout_created → run_screen_opened → workout_started → workout_completed
-- workout_session_started is the pre-rename name of run_screen_opened, still sent by older app builds.
create or replace function onboarding_funnel(num_days int default 30)
returns table(
  step text,
  user_count int,
  pct numeric
) as $$
  with base as (
    select distinct anonymous_user_id
    from events
    where event_name = 'app_opened'
      and created_at > now() - (num_days || ' days')::interval
  ),
  steps as (
    select
      (select count(*) from base)::int as opened,
      (select count(distinct e.anonymous_user_id)
       from events e
       inner join base b on b.anonymous_user_id = e.anonymous_user_id
       where e.event_name in ('workout_saved', 'workout_created')
         and e.created_at > now() - (num_days || ' days')::interval
      )::int as edited,
      (select count(distinct e.anonymous_user_id)
       from events e
       inner join base b on b.anonymous_user_id = e.anonymous_user_id
       where e.event_name in ('run_screen_opened', 'workout_session_started')
         and e.created_at > now() - (num_days || ' days')::interval
      )::int as run_screen,
      (select count(distinct e.anonymous_user_id)
       from events e
       inner join base b on b.anonymous_user_id = e.anonymous_user_id
       where e.event_name = 'workout_started'
         and e.created_at > now() - (num_days || ' days')::interval
      )::int as started,
      (select count(distinct e.anonymous_user_id)
       from events e
       inner join base b on b.anonymous_user_id = e.anonymous_user_id
       where e.event_name = 'workout_completed'
         and e.created_at > now() - (num_days || ' days')::interval
      )::int as completed
  )
  select s.step, s.user_count,
    case when steps.opened = 0 then 0
      else round(s.user_count::numeric / steps.opened::numeric * 100, 1)
    end as pct
  from steps,
  lateral (values
    ('Opened App', steps.opened),
    ('Edited/Created Workout', steps.edited),
    ('Opened Run Screen', steps.run_screen),
    ('Started Workout', steps.started),
    ('Completed Workout', steps.completed)
  ) as s(step, user_count);
$$ language sql security definer;

-- AI Workout Plan Adoption Rate:
-- Users who completed a workout / users who generated an AI workout plan.
-- Uses ai_generations (authenticated) + cloud_history (authenticated) so
-- both sides share user_id and work with existing data.
create or replace function ai_adoption_rate(num_days int default 30)
returns table(
  ai_users int,
  ai_users_completed int,
  adoption_rate numeric
) as $$
  with ai_users as (
    select distinct user_id
    from ai_generations
    where created_at > now() - (num_days || ' days')::interval
  ),
  ai_completers as (
    select distinct a.user_id
    from ai_users a
    inner join cloud_history ch
      on ch.user_id = a.user_id
      and ch.deleted_at is null
  )
  select
    (select count(*) from ai_users)::int as ai_users,
    (select count(*) from ai_completers)::int as ai_users_completed,
    case
      when (select count(*) from ai_users) = 0 then 0
      else round(
        (select count(*) from ai_completers)::numeric /
        (select count(*) from ai_users)::numeric * 100, 1
      )
    end as adoption_rate;
$$ language sql security definer;

-- AI training plans (last N days). Plans are saved as soon as the AI
-- returns them, so "accepted" (shown as "started") means the runner
-- completed >= 1 plan workout.
-- Excludes the 'custom' calendar plans created for manually scheduled workouts.
create or replace function training_plan_stats(num_days int default 30)
returns table(
  generated int,
  still_active int,
  archived int,
  accepted int,
  failed int,
  unique_users int,
  acceptance_rate numeric
) as $$
  with plans as (
    select
      tp.id,
      tp.user_id,
      tp.status,
      exists (
        select 1 from plan_workouts pw
        where pw.plan_id = tp.id and pw.status = 'completed'
      ) as is_accepted
    from training_plans tp
    where tp.race_type <> 'custom'
      and tp.created_at > now() - (num_days || ' days')::interval
  )
  select
    count(*)::int as generated,
    count(*) filter (where status = 'active')::int as still_active,
    count(*) filter (where status in ('archived', 'deleted'))::int as archived,
    count(*) filter (where is_accepted)::int as accepted,
    (select count(*) from events
      where event_name = 'plan_generation_failed'
        and created_at > now() - (num_days || ' days')::interval)::int as failed,
    count(distinct user_id)::int as unique_users,
    case
      when count(*) = 0 then 0
      else round(count(*) filter (where is_accepted)::numeric / count(*)::numeric * 100, 1)
    end as acceptance_rate
  from plans;
$$ language sql security definer;

-- DAU per day for the last N days (unique devices that opened the app)
create or replace function dau_per_day(num_days int default 30)
returns table(date text, count int) as $$
  select
    to_char(d.day, 'YYYY-MM-DD') as date,
    coalesce(count(distinct e.anonymous_user_id), 0)::int as count
  from generate_series(
    current_date - (num_days - 1),
    current_date,
    '1 day'::interval
  ) as d(day)
  left join events e
    on e.created_at::date = d.day
    and e.event_name = 'app_opened'
  group by d.day
  order by d.day;
$$ language sql security definer;

-- Signups per day for the last N days
create or replace function signups_per_day(num_days int default 30)
returns table(date text, count int) as $$
  select
    to_char(d.day, 'YYYY-MM-DD') as date,
    coalesce(count(p.id), 0)::int as count
  from generate_series(
    current_date - (num_days - 1),
    current_date,
    '1 day'::interval
  ) as d(day)
  left join profiles p on p.created_at::date = d.day
  group by d.day
  order by d.day;
$$ language sql security definer;

-- Events per day for the last N days
create or replace function events_per_day(num_days int default 30)
returns table(date text, count int) as $$
  select
    to_char(d.day, 'YYYY-MM-DD') as date,
    coalesce(count(e.id), 0)::int as count
  from generate_series(
    current_date - (num_days - 1),
    current_date,
    '1 day'::interval
  ) as d(day)
  left join events e on e.created_at::date = d.day
  group by d.day
  order by d.day;
$$ language sql security definer;

-- Unique devices by country over the last N days.
-- Uses the latest app_opened country so each device is counted once.
create or replace function users_by_country(num_days int default 30)
returns table(country text, user_count int) as $$
  with latest as (
    select distinct on (anonymous_user_id)
      anonymous_user_id,
      country
    from events
    where event_name = 'app_opened'
      and created_at > now() - (num_days || ' days')::interval
    order by anonymous_user_id, created_at desc
  )
  select
    coalesce(nullif(country, ''), 'unknown') as country,
    count(*)::int as user_count
  from latest
  group by 1
  order by user_count desc, country;
$$ language sql security definer;

-- Unique devices by app version over the last N days.
-- Uses the latest app_opened version so each device is counted once.
create or replace function users_by_app_version(num_days int default 30)
returns table(app_version text, user_count int) as $$
  with latest as (
    select distinct on (anonymous_user_id)
      anonymous_user_id,
      app_version
    from events
    where event_name = 'app_opened'
      and created_at > now() - (num_days || ' days')::interval
    order by anonymous_user_id, created_at desc
  )
  select
    coalesce(nullif(app_version, ''), 'unknown') as app_version,
    count(*)::int as user_count
  from latest
  group by 1
  order by user_count desc, app_version;
$$ language sql security definer;

-- Unique devices by country and platform over the last N days.
-- Country comes from the latest app_opened, like users_by_country. Platform
-- falls back to the devices table for opens from builds that predate
-- events.platform.
create or replace function users_by_country_platform(num_days int default 30)
returns table(country text, platform text, user_count int) as $$
  with latest as (
    select distinct on (anonymous_user_id)
      anonymous_user_id,
      country,
      platform
    from events
    where event_name = 'app_opened'
      and created_at > now() - (num_days || ' days')::interval
    order by anonymous_user_id, created_at desc
  )
  select
    coalesce(nullif(l.country, ''), d.country, 'unknown') as country,
    coalesce(l.platform, d.platform, 'unknown') as platform,
    count(*)::int as user_count
  from latest l
  left join devices d on d.anonymous_user_id = l.anonymous_user_id
  group by 1, 2
  order by user_count desc, country, platform;
$$ language sql security definer;

-- ── Qualifying Runs ───────────────────────────────────────────
-- A "qualifying run" is a workout_completed event, or a workout_abandoned
-- event where the runner covered >= 50% of the planned time (>= 10 minutes
-- for runs with no planned time). Newer app builds send metadata.qualifies;
-- older events are judged from completion_pct and elapsed_ms. Production
-- only, minus devices listed in analytics_excluded_devices.
--
-- A runner "returned" when they logged another qualifying run at least
-- 6 hours after their first, so a restart right after a stopped run
-- doesn't count as coming back.

create table if not exists public.analytics_excluded_devices (
  anonymous_user_id text primary key,
  note              text,
  created_at        timestamptz not null default now()
);
alter table public.analytics_excluded_devices enable row level security;

create or replace view public.qualifying_runs
with (security_invoker = true) as
with runs as (
  select
    e.id,
    e.anonymous_user_id,
    e.user_id,
    e.created_at,
    e.event_name,
    e.metadata,
    e.platform,
    e.country,
    e.app_version
  from events e
  where e.environment = 'production'
    and e.event_name in ('workout_completed', 'workout_abandoned')
    and not exists (
      select 1 from analytics_excluded_devices x
      where x.anonymous_user_id = e.anonymous_user_id
    )
    and (
      e.event_name = 'workout_completed'
      or case
        when e.metadata ? 'qualifies' then (e.metadata->>'qualifies')::boolean
        else coalesce((e.metadata->>'completion_pct')::numeric, 0) >= 50
          or (
            coalesce((e.metadata->>'completion_pct')::numeric, 0) = 0
            and coalesce((e.metadata->>'elapsed_ms')::numeric, 0) >= 600000
          )
      end
    )
)
select
  runs.*,
  row_number() over (partition by anonymous_user_id order by created_at)::int as run_number
from runs;

-- One row per runner: their first qualifying run and the first run they came back for.
create or replace view public.first_run_returns
with (security_invoker = true) as
with q as (select * from qualifying_runs)
select
  f.anonymous_user_id,
  f.user_id,
  f.created_at as first_at,
  f.event_name as first_event,
  f.metadata   as first_metadata,
  f.platform,
  f.country,
  s.created_at as second_at,
  s.metadata   as second_metadata,
  (select count(*) from q q2 where q2.anonymous_user_id = f.anonymous_user_id)::int as total_runs
from q f
left join lateral (
  select q2.created_at, q2.metadata
  from q q2
  where q2.anonymous_user_id = f.anonymous_user_id
    and q2.created_at >= f.created_at + interval '6 hours'
  order by q2.created_at
  limit 1
) s on true
where f.run_number = 1;

revoke all on public.qualifying_runs from public, anon, authenticated;
revoke all on public.first_run_returns from public, anon, authenticated;
revoke all on public.analytics_excluded_devices from public, anon, authenticated;
grant select on public.qualifying_runs to service_role;
grant select on public.first_run_returns to service_role;
grant all on public.analytics_excluded_devices to service_role;

-- ── Second-Run Retention ──────────────────────────────────────
-- By weekly cohort of first runs. eligible_N counts runners whose first run
-- was at least N days ago, so recent runners don't drag the rate down
-- before they've had the chance.
drop function if exists second_run_retention(int);
create or replace function second_run_retention(cohort_weeks int default 12)
returns table(
  cohort text,
  first_runners int,
  eligible_7 int,
  returned_7 int,
  eligible_14 int,
  returned_14 int,
  eligible_30 int,
  returned_30 int
) as $$
  select
    to_char(date_trunc('week', first_at), 'YYYY-MM-DD') as cohort,
    count(*)::int as first_runners,
    count(*) filter (where first_at <= now() - interval '7 days')::int,
    count(*) filter (where first_at <= now() - interval '7 days'
                       and second_at <= first_at + interval '7 days')::int,
    count(*) filter (where first_at <= now() - interval '14 days')::int,
    count(*) filter (where first_at <= now() - interval '14 days'
                       and second_at <= first_at + interval '14 days')::int,
    count(*) filter (where first_at <= now() - interval '30 days')::int,
    count(*) filter (where first_at <= now() - interval '30 days'
                       and second_at <= first_at + interval '30 days')::int
  from first_run_returns
  where first_at > date_trunc('week', now()) - (cohort_weeks || ' weeks')::interval
  group by 1
  order by 1;
$$ language sql security definer;

-- How first runs start, with 14-day return rates.
-- Events from builds before workout context shipped report "unknown".
drop function if exists first_run_breakdown(int);
create or replace function first_run_breakdown(num_days int default 90)
returns table(
  dimension text,
  value text,
  first_runners int,
  eligible int,
  returned int,
  return_pct numeric
) as $$
  with base as (
    select
      f.*,
      coalesce(
        (f.first_metadata->>'total_duration_ms')::numeric,
        (f.first_metadata->>'elapsed_ms')::numeric,
        0
      ) / 60000 as minutes,
      exists (
        select 1 from events e
        where e.anonymous_user_id = f.anonymous_user_id
          and e.event_name = 'next_run_suggestion_added'
          and e.created_at between f.first_at and f.first_at + interval '1 day'
      ) as planned_next
    from first_run_returns f
    where f.first_at > now() - (num_days || ' days')::interval
  ),
  dims as (
    select b.*, d.dimension, d.value
    from base b
    cross join lateral (values
      ('Source', coalesce(b.first_metadata->>'workout_source', 'unknown')),
      ('Origin', coalesce(b.first_metadata->>'workout_origin', 'unknown')),
      ('Category', coalesce(b.first_metadata->>'workout_category', 'unknown')),
      ('Quick start', coalesce(b.first_metadata->>'quick_start_type', 'none')),
      ('Structure', case (b.first_metadata->>'is_structured')
        when 'true' then 'structured'
        when 'false' then 'simple'
        else 'unknown' end),
      ('Duration', case
        when b.minutes < 15 then '< 15 min'
        when b.minutes < 30 then '15-30 min'
        when b.minutes < 45 then '30-45 min'
        when b.minutes < 60 then '45-60 min'
        else '60+ min' end),
      ('Audio cues', coalesce(b.first_metadata->>'audio_cue_mode', 'unknown')),
      ('GPS', case
        when b.first_metadata->>'gps_enabled' = 'false' then 'off'
        when b.first_metadata->>'gps_sample_count' is null then 'unknown'
        when (b.first_metadata->>'gps_sample_count')::int = 0 then 'no fix'
        when (b.first_metadata->>'gps_accuracy_p90_m')::numeric > 30 then 'poor'
        else 'good' end),
      ('Ended', case b.first_event
        when 'workout_completed' then 'finished'
        else 'stopped early' end),
      ('Planned next run', case when b.planned_next then 'yes' else 'no' end),
      ('Platform', coalesce(b.platform, 'unknown'))
    ) as d(dimension, value)
  )
  select
    dimension,
    value,
    count(*)::int as first_runners,
    count(*) filter (where first_at <= now() - interval '14 days')::int as eligible,
    count(*) filter (where first_at <= now() - interval '14 days'
                       and second_at <= first_at + interval '14 days')::int as returned,
    case
      when count(*) filter (where first_at <= now() - interval '14 days') = 0 then null
      else round(
        count(*) filter (where first_at <= now() - interval '14 days'
                           and second_at <= first_at + interval '14 days')::numeric
        / count(*) filter (where first_at <= now() - interval '14 days')::numeric * 100,
        1
      )
    end as return_pct
  from dims
  group by dimension, value
  order by dimension, first_runners desc;
$$ language sql security definer;

-- Recent first-time runners, newest first.
drop function if exists first_run_users(int);
create or replace function first_run_users(num_days int default 30)
returns table(
  anonymous_user_id text,
  display_name text,
  first_at timestamptz,
  first_workout text,
  first_source text,
  first_category text,
  first_minutes numeric,
  first_ended text,
  second_at timestamptz,
  second_workout text,
  gap_days numeric,
  total_runs int,
  platform text,
  country text
) as $$
  select
    f.anonymous_user_id,
    coalesce(p.display_name, u.email) as display_name,
    f.first_at,
    f.first_metadata->>'workout_name',
    f.first_metadata->>'workout_source',
    f.first_metadata->>'workout_category',
    round(coalesce(
      (f.first_metadata->>'total_duration_ms')::numeric,
      (f.first_metadata->>'elapsed_ms')::numeric,
      0
    ) / 60000, 1),
    case f.first_event when 'workout_completed' then 'finished' else 'stopped early' end,
    f.second_at,
    f.second_metadata->>'workout_name',
    round(extract(epoch from (f.second_at - f.first_at))::numeric / 86400, 1),
    f.total_runs,
    f.platform,
    f.country
  from first_run_returns f
  left join profiles p on p.id = f.user_id
  left join auth.users u on u.id = f.user_id
  where f.first_at > now() - (num_days || ' days')::interval
  order by f.first_at desc;
$$ language sql security definer;

-- Every event for one device, newest first.
drop function if exists user_timeline(text, int);
create or replace function user_timeline(p_anonymous_user_id text, max_rows int default 500)
returns table(
  created_at timestamptz,
  event_name text,
  metadata jsonb,
  app_version text,
  environment text,
  user_id uuid
) as $$
  select e.created_at, e.event_name, e.metadata, e.app_version, e.environment, e.user_id
  from events e
  where e.anonymous_user_id = p_anonymous_user_id
  order by e.created_at desc
  limit max_rows;
$$ language sql security definer;

-- Next-run funnel: suggestion → calendar → reminder → run (unique devices).
drop function if exists next_run_funnel(int);
create or replace function next_run_funnel(num_days int default 30)
returns table(step text, user_count int) as $$
  with e as (
    select anonymous_user_id, event_name, metadata
    from events
    where environment = 'production'
      and created_at > now() - (num_days || ' days')::interval
  )
  select s.step, s.n::int
  from (values
    (1, 'Suggestion shown',
      (select count(distinct anonymous_user_id) from e where event_name = 'next_run_suggestion_shown')),
    (2, 'Sign-in prompted',
      (select count(distinct anonymous_user_id) from e where event_name = 'next_run_suggestion_signin_prompted')),
    (3, 'Added to calendar',
      (select count(distinct anonymous_user_id) from e where event_name = 'next_run_suggestion_added')),
    (4, 'Reminder scheduled',
      (select count(distinct anonymous_user_id) from e where event_name = 'run_reminder_scheduled')),
    (5, 'Reminder opened',
      (select count(distinct anonymous_user_id) from e where event_name = 'run_reminder_opened')),
    (6, 'Ran suggested workout',
      (select count(distinct anonymous_user_id) from qualifying_runs q
        where q.created_at > now() - (num_days || ' days')::interval
          and q.metadata->>'workout_origin' = 'next_run_suggestion'))
  ) as s(ord, step, n)
  order by s.ord;
$$ language sql security definer;

-- Why one-run users didn't come back (in-app survey answers).
drop function if exists lapsed_survey_breakdown(int);
create or replace function lapsed_survey_breakdown(num_days int default 90)
returns table(reason text, user_count int) as $$
  select
    coalesce(metadata->>'reason', 'unknown') as reason,
    count(distinct anonymous_user_id)::int as user_count
  from events
  where environment = 'production'
    and event_name = 'lapsed_survey_answered'
    and created_at > now() - (num_days || ' days')::interval
  group by 1
  order by user_count desc;
$$ language sql security definer;

-- Lapsed survey: how many saw it, answered, commented, or closed it.
drop function if exists lapsed_survey_summary(int);
create or replace function lapsed_survey_summary(num_days int default 90)
returns table(step text, user_count int) as $$
  with e as (
    select anonymous_user_id, event_name
    from events
    where environment = 'production'
      and event_name like 'lapsed_survey_%'
      and created_at > now() - (num_days || ' days')::interval
      and anonymous_user_id not in (select anonymous_user_id from analytics_excluded_devices)
  )
  select s.step, s.n::int
  from (values
    (1, 'Saw the survey',
      (select count(distinct anonymous_user_id) from e where event_name = 'lapsed_survey_shown')),
    (2, 'Picked a reason',
      (select count(distinct anonymous_user_id) from e where event_name = 'lapsed_survey_answered')),
    (3, 'Wrote a comment',
      (select count(distinct anonymous_user_id) from e where event_name = 'lapsed_survey_detail')),
    (4, 'Closed without answering',
      (select count(distinct anonymous_user_id) from e where event_name = 'lapsed_survey_dismissed'))
  ) as s(ord, step, n)
  order by s.ord;
$$ language sql security definer;

-- Lapsed survey: free-text comments, newest first, with runs logged since.
drop function if exists lapsed_survey_comments(int, int);
create or replace function lapsed_survey_comments(num_days int default 90, max_rows int default 100)
returns table(
  created_at timestamptz,
  anonymous_user_id text,
  reason text,
  detail text,
  platform text,
  app_version text,
  runs_since int
) as $$
  select
    e.created_at,
    e.anonymous_user_id,
    e.metadata->>'reason',
    e.metadata->>'detail',
    e.platform,
    e.app_version,
    (select count(*) from qualifying_runs q
      where q.anonymous_user_id = e.anonymous_user_id
        and q.created_at > e.created_at)::int
  from events e
  where e.environment = 'production'
    and e.event_name = 'lapsed_survey_detail'
    and e.created_at > now() - (num_days || ' days')::interval
    and e.anonymous_user_id not in (select anonymous_user_id from analytics_excluded_devices)
  order by e.created_at desc
  limit max_rows;
$$ language sql security definer;

-- Run reminders: asked → scheduled → opened → ran.
drop function if exists run_reminder_funnel(int);
create or replace function run_reminder_funnel(num_days int default 30)
returns table(step text, user_count int) as $$
  with e as (
    select anonymous_user_id, event_name, metadata
    from events
    where environment = 'production'
      and event_name in ('run_reminder_requested', 'run_reminder_denied', 'run_reminder_scheduled',
                         'run_reminder_opened', 'workout_started')
      and created_at > now() - (num_days || ' days')::interval
      and anonymous_user_id not in (select anonymous_user_id from analytics_excluded_devices)
  )
  select s.step, s.n::int
  from (values
    (1, 'Asked for a reminder',
      (select count(distinct anonymous_user_id) from e where event_name = 'run_reminder_requested')),
    (2, 'Blocked: notifications off',
      (select count(distinct anonymous_user_id) from e where event_name = 'run_reminder_denied')),
    (3, 'Reminder scheduled',
      (select count(distinct anonymous_user_id) from e
        where event_name = 'run_reminder_scheduled' and coalesce(metadata->>'rescheduled', 'false') <> 'true')),
    (4, 'Opened from the notification',
      (select count(distinct anonymous_user_id) from e where event_name = 'run_reminder_opened')),
    (5, 'Started the run',
      (select count(distinct anonymous_user_id) from e
        where event_name = 'workout_started' and metadata->>'workout_source' = 'reminder')),
    (6, 'Finished it',
      (select count(distinct anonymous_user_id) from qualifying_runs q
        where q.created_at > now() - (num_days || ' days')::interval
          and q.metadata->>'workout_source' = 'reminder'))
  ) as s(ord, step, n)
  order by s.ord;
$$ language sql security definer;

-- ── Workout Retention Curve ───────────────────────────────────
-- For users with at least 1 qualifying run, what % went on to a 2nd, 3rd,
-- 4th, 5th. Cohorted by the month of their first run so we can see if
-- newer cohorts are "stickier".
drop function if exists workout_retention_curve(int);

create or replace function workout_retention_curve(num_months int default 6)
returns table(
  cohort text,
  workout_number int,
  user_count int,
  pct numeric
) as $$
  with user_completions as (
    select
      anonymous_user_id,
      max(run_number)::int as total_completions,
      to_char(min(created_at), 'YYYY-MM') as first_month
    from qualifying_runs
    group by anonymous_user_id
  ),
  workout_nums(n) as (
    values (1), (2), (3), (4), (5)
  ),
  -- All-time aggregate
  all_time as (
    select
      'All'::text as cohort,
      wn.n as workout_number,
      count(*) filter (where uc.total_completions >= wn.n)::int as user_count,
      round(
        count(*) filter (where uc.total_completions >= wn.n)::numeric
        / count(*)::numeric * 100, 1
      ) as pct
    from user_completions uc
    cross join workout_nums wn
    group by wn.n
  ),
  -- Per-month cohorts
  monthly as (
    select
      uc.first_month as cohort,
      wn.n as workout_number,
      count(*) filter (where uc.total_completions >= wn.n)::int as user_count,
      round(
        count(*) filter (where uc.total_completions >= wn.n)::numeric
        / count(*)::numeric * 100, 1
      ) as pct
    from user_completions uc
    cross join workout_nums wn
    where uc.first_month >= to_char(
      now() - (num_months || ' months')::interval, 'YYYY-MM'
    )
    group by uc.first_month, wn.n
  )
  select * from all_time
  union all
  select * from monthly
  order by cohort, workout_number;
$$ language sql security definer;

-- ── Sharing Analytics ────────────────────────────────────────

-- Drop sharing functions whose return types may have changed
drop function if exists shares_per_day(int);
drop function if exists share_stats(int);
drop function if exists shares_by_user(int);

-- Shares per day for the last N days (structure vs results breakdown)
create or replace function shares_per_day(num_days int default 30)
returns table(date text, structure int, results int, total int) as $$
  select
    to_char(d.day, 'YYYY-MM-DD') as date,
    coalesce(count(*) filter (where sw.share_type = 'structure'), 0)::int as structure,
    coalesce(count(*) filter (where sw.share_type = 'results'), 0)::int as results,
    coalesce(count(sw.code), 0)::int as total
  from generate_series(
    current_date - (num_days - 1),
    current_date,
    '1 day'::interval
  ) as d(day)
  left join shared_workouts sw on sw.created_at::date = d.day
  group by d.day
  order by d.day;
$$ language sql security definer;

-- Sharing summary stats for the last N days
create or replace function share_stats(num_days int default 30)
returns table(
  total_shares int,
  structure_shares int,
  results_shares int,
  unique_sharers int,
  shares_today int
) as $$
  select
    count(*)::int as total_shares,
    count(*) filter (where share_type = 'structure')::int as structure_shares,
    count(*) filter (where share_type = 'results')::int as results_shares,
    count(distinct user_id)::int as unique_sharers,
    count(*) filter (where created_at::date = current_date)::int as shares_today
  from shared_workouts
  where created_at > now() - (num_days || ' days')::interval;
$$ language sql security definer;

-- Shares broken down by user (last N days)
-- Resolves to display name or email when user_id is available.
create or replace function shares_by_user(num_days int default 7)
returns table(
  user_id uuid,
  display_name text,
  share_count int,
  latest_at timestamptz
) as $$
  select
    sw.user_id,
    coalesce(p.display_name, u.email, sw.user_id::text) as display_name,
    count(*)::int as share_count,
    max(sw.created_at) as latest_at
  from shared_workouts sw
  left join profiles p on p.id = sw.user_id
  left join auth.users u on u.id = sw.user_id
  where sw.created_at > now() - (num_days || ' days')::interval
    and sw.user_id is not null
  group by sw.user_id, p.display_name, u.email
  order by share_count desc;
$$ language sql security definer;

-- ── Strava ───────────────────────────────────────────────────
-- Push counts come from the client's strava_workout_pushed events, which are
-- only sent after a successful upload; pushes before that event shipped are
-- not counted.

drop function if exists strava_stats(int);
drop function if exists strava_users(int);
drop function if exists power_users(int, int);

-- Strava summary: connected accounts (current) plus activity in the last N days.
create or replace function strava_stats(num_days int default 30)
returns table(
  connected_users int,
  connected_pct numeric,
  new_connections int,
  disconnects int,
  pushes int,
  auto_pushes int,
  unique_pushers int
) as $$
  with connections as (
    select
      count(*)::int as connected_users,
      count(*) filter (
        where connected_at > now() - (num_days || ' days')::interval
      )::int as new_connections
    from strava_connections
  ),
  activity as (
    select
      count(*) filter (where event_name = 'strava_disconnected')::int as disconnects,
      count(*) filter (where event_name = 'strava_workout_pushed')::int as pushes,
      count(*) filter (
        where event_name = 'strava_workout_pushed' and metadata->>'trigger' = 'auto'
      )::int as auto_pushes,
      count(distinct coalesce(user_id::text, anonymous_user_id)) filter (
        where event_name = 'strava_workout_pushed'
      )::int as unique_pushers
    from events
    where event_name in ('strava_workout_pushed', 'strava_disconnected')
      and created_at > now() - (num_days || ' days')::interval
  ),
  total as (
    select count(*) as n from profiles
  )
  select
    c.connected_users,
    case
      when total.n = 0 then 0
      else round(c.connected_users::numeric / total.n::numeric * 100, 1)
    end as connected_pct,
    c.new_connections,
    a.disconnects,
    a.pushes,
    a.auto_pushes,
    a.unique_pushers
  from connections c, activity a, total;
$$ language sql security definer;

-- Every user who is connected to Strava or has ever pushed a workout,
-- with all-time and last-N-days push counts.
create or replace function strava_users(num_days int default 30)
returns table(
  user_id uuid,
  display_name text,
  athlete_name text,
  is_connected boolean,
  connected_at timestamptz,
  push_count int,
  pushes_period int,
  auto_push_count int,
  latest_push_at timestamptz
) as $$
  with pushes as (
    select
      e.user_id,
      count(*)::int as push_count,
      count(*) filter (
        where e.created_at > now() - (num_days || ' days')::interval
      )::int as pushes_period,
      count(*) filter (where e.metadata->>'trigger' = 'auto')::int as auto_push_count,
      max(e.created_at) as latest_push_at
    from events e
    where e.event_name = 'strava_workout_pushed'
      and e.user_id is not null
    group by e.user_id
  ),
  people as (
    select sc.user_id from strava_connections sc
    union
    select pu.user_id from pushes pu
  )
  select
    pp.user_id,
    coalesce(p.display_name, u.email, pp.user_id::text) as display_name,
    sc.athlete_name,
    sc.user_id is not null as is_connected,
    sc.connected_at,
    coalesce(pu.push_count, 0) as push_count,
    coalesce(pu.pushes_period, 0) as pushes_period,
    coalesce(pu.auto_push_count, 0) as auto_push_count,
    pu.latest_push_at
  from people pp
  left join strava_connections sc on sc.user_id = pp.user_id
  left join pushes pu on pu.user_id = pp.user_id
  left join profiles p on p.id = pp.user_id
  left join auth.users u on u.id = pp.user_id
  order by push_count desc, sc.connected_at desc nulls last;
$$ language sql security definer;

-- ── Access Control ───────────────────────────────────────────
-- Keep this block last. Dropping and recreating a function restores the
-- default execute grant to anon/authenticated (the mobile app's public key).
-- These are security definer and several return emails, so only the admin
-- dashboard's service-role client may call them.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'activation_rate()',
    'ai_adoption_rate(int)',
    'ai_generations_by_user(int)',
    'ai_generations_count(int)',
    'core_engagement_rate()',
    'dau_per_day(int)',
    'dau_today()',
    'events_per_day(int)',
    'free_to_paid_rate()',
    'new_users(int)',
    'onboarding_funnel(int)',
    'pro_subscribers()',
    'share_stats(int)',
    'shares_by_user(int)',
    'shares_per_day(int)',
    'signups_per_day(int)',
    'strava_stats(int)',
    'strava_users(int)',
    'todays_events_by_user()',
    'total_users()',
    'training_plan_stats(int)',
    'training_plans_by_user(int)',
    'users_by_app_version(int)',
    'users_by_country(int)',
    'users_by_country_platform(int)',
    'wau()',
    'week4_retention()',
    'workout_completion_stats(int)',
    'workout_retention_curve(int)',
    'workouts_per_day(int)',
    'second_run_retention(int)',
    'first_run_breakdown(int)',
    'first_run_users(int)',
    'user_timeline(text, int)',
    'next_run_funnel(int)',
    'lapsed_survey_breakdown(int)',
    'lapsed_survey_summary(int)',
    'lapsed_survey_comments(int, int)',
    'run_reminder_funnel(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Pin search_path on the retention functions (Supabase lint 0011).
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'second_run_retention(int)',
    'first_run_breakdown(int)',
    'first_run_users(int)',
    'user_timeline(text, int)',
    'next_run_funnel(int)',
    'lapsed_survey_breakdown(int)',
    'workout_retention_curve(int)',
    'lapsed_survey_summary(int)',
    'lapsed_survey_comments(int, int)',
    'run_reminder_funnel(int)'
  ] loop
    execute format('alter function %s set search_path = public, pg_temp', fn);
  end loop;
end;
$$;
