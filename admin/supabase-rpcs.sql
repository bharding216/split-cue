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
-- Tracks: app_opened → workout_saved/workout_created → workout_started → workout_completed
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

-- ── Workout Retention Curve ───────────────────────────────────
-- For users who completed at least 1 workout, what % went on to complete
-- a 2nd, 3rd, 4th, 5th. Cohorted by the month of their first completion
-- so we can see if newer cohorts are "stickier".
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
      count(*)::int as total_completions,
      to_char(min(created_at), 'YYYY-MM') as first_month
    from events
    where event_name = 'workout_completed'
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
