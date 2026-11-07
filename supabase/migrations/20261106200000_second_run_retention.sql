-- Second-run retention analytics for the admin dashboard.
--
-- A "qualifying run" is a workout_completed event, or a workout_abandoned
-- event where the runner covered >= 50% of the planned time (>= 10 minutes
-- for runs with no planned time). Newer app builds send metadata.qualifies;
-- older events are judged from completion_pct and elapsed_ms.
--
-- A runner "returned" when they logged another qualifying run at least
-- 6 hours after their first, so a restart right after a stopped run
-- doesn't count as coming back.

-- ── Devices left out of analytics (your own test phones) ─────────────
create table if not exists public.analytics_excluded_devices (
  anonymous_user_id text primary key,
  note              text,
  created_at        timestamptz not null default now()
);
alter table public.analytics_excluded_devices enable row level security;

-- ── Qualifying runs ───────────────────────────────────────────────────
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

-- ── Second-run retention by weekly cohort ─────────────────────────────
-- eligible_N counts runners whose first run was at least N days ago, so
-- recent runners don't drag the rate down before they've had the chance.
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

-- ── How first runs start, with 14-day return rates ────────────────────
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

-- ── Recent first-time runners ─────────────────────────────────────────
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

-- ── Every event for one device ────────────────────────────────────────
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

-- ── Next-run funnel: suggestion → calendar → reminder → run ───────────
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

-- ── Why one-run users didn't come back ────────────────────────────────
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

-- ── Workout retention curve, on qualifying runs ───────────────────────
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

-- ── Access control ────────────────────────────────────────────────────
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
    'workout_retention_curve(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
