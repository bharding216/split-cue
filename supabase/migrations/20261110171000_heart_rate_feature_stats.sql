-- Heart rate feature analytics for the admin dashboard.
--
-- Built only from feature-usage events (hr_device_connected, hr_workout_started,
-- hr_workout_completed, hr_analysis_viewed, hr_pro_upgrade_clicked,
-- hr_connection_failed, hr_consent_*), the run_has_hr flag on workout events,
-- and subscriptions. These functions never read workout_hr_samples or any
-- heart rate values. Counts are per device (anonymous_user_id), production
-- only, excluding analytics_excluded_devices.

drop function if exists hr_feature_stats(int);
create or replace function hr_feature_stats(num_days int default 30)
returns table(
  active_devices int,
  hr_devices int,
  adoption_pct numeric,
  hr_workouts_started int,
  hr_workouts_completed int,
  completion_pct numeric,
  hr_completers int,
  analysis_viewers int,
  analysis_pct numeric,
  upgrade_clickers int,
  upgrade_converted int,
  conversion_pct numeric,
  consent_granted int,
  consent_declined int,
  connection_failures int
) as $$
  with e as (
    select ev.anonymous_user_id, ev.user_id, ev.event_name
    from events ev
    where ev.environment = 'production'
      and ev.created_at > now() - (num_days || ' days')::interval
      and ev.event_name in (
        'workout_started', 'hr_device_connected', 'hr_workout_started',
        'hr_workout_completed', 'hr_analysis_viewed', 'hr_pro_upgrade_clicked',
        'hr_connection_failed', 'hr_consent_granted', 'hr_consent_declined'
      )
      and not exists (
        select 1 from analytics_excluded_devices x
        where x.anonymous_user_id = ev.anonymous_user_id
      )
  ),
  linked as (
    select distinct on (anonymous_user_id) anonymous_user_id, user_id
    from events
    where user_id is not null
    order by anonymous_user_id, created_at desc
  ),
  completers as (
    select distinct anonymous_user_id from e where event_name = 'hr_workout_completed'
  ),
  clickers as (
    select distinct anonymous_user_id from e where event_name = 'hr_pro_upgrade_clicked'
  ),
  counts as (
    select
      count(distinct anonymous_user_id) filter (where event_name = 'workout_started')::int as active_devices,
      count(distinct anonymous_user_id) filter (where event_name = 'hr_device_connected')::int as hr_devices,
      count(*) filter (where event_name = 'hr_workout_started')::int as hr_started,
      count(*) filter (where event_name = 'hr_workout_completed')::int as hr_completed,
      count(*) filter (where event_name = 'hr_connection_failed')::int as failures,
      count(distinct anonymous_user_id) filter (where event_name = 'hr_consent_granted')::int as granted,
      count(distinct anonymous_user_id) filter (where event_name = 'hr_consent_declined')::int as declined
    from e
  ),
  viewers as (
    select count(distinct v.anonymous_user_id)::int as n
    from e v
    join completers c on c.anonymous_user_id = v.anonymous_user_id
    where v.event_name = 'hr_analysis_viewed'
  ),
  converted as (
    select count(*)::int as n
    from clickers c
    join linked l on l.anonymous_user_id = c.anonymous_user_id
    where exists (
      select 1 from subscriptions s
      where s.user_id = l.user_id and s.tier = 'pro' and s.status in ('active', 'trialing')
    )
  )
  select
    c.active_devices,
    c.hr_devices,
    case when c.active_devices = 0 then 0
      else round(c.hr_devices::numeric / c.active_devices * 100, 1) end,
    c.hr_started,
    c.hr_completed,
    case when c.hr_started = 0 then 0
      else round(c.hr_completed::numeric / c.hr_started * 100, 1) end,
    (select count(*)::int from completers),
    v.n,
    case when (select count(*) from completers) = 0 then 0
      else round(v.n::numeric / (select count(*) from completers) * 100, 1) end,
    (select count(*)::int from clickers),
    cv.n,
    case when (select count(*) from clickers) = 0 then 0
      else round(cv.n::numeric / (select count(*) from clickers) * 100, 1) end,
    c.granted,
    c.declined,
    c.failures
  from counts c, viewers v, converted cv;
$$ language sql security definer set search_path = public;

-- Runners who recorded heart rate on any qualifying run versus those who never
-- did, among runners whose first qualifying run was in the last N days.
-- Correlation only: runners who buy a monitor may already be more committed.
drop function if exists hr_retention_comparison(int);
create or replace function hr_retention_comparison(num_days int default 90)
returns table(
  cohort text,
  runners int,
  second_run_pct numeric,
  runs_per_active_week numeric,
  pro_pct numeric
) as $$
  with firsts as (
    select f.anonymous_user_id, f.second_at
    from first_run_returns f
    where f.first_at > now() - (num_days || ' days')::interval
  ),
  runs as (
    select q.anonymous_user_id, q.created_at, (q.metadata->>'run_has_hr')::boolean as has_hr
    from qualifying_runs q
    join firsts f on f.anonymous_user_id = q.anonymous_user_id
  ),
  linked as (
    select distinct on (anonymous_user_id) anonymous_user_id, user_id
    from events
    where user_id is not null
    order by anonymous_user_id, created_at desc
  ),
  per_runner as (
    select
      f.anonymous_user_id,
      f.second_at is not null as returned,
      count(r.*) as run_count,
      count(distinct date_trunc('week', r.created_at)) as active_weeks,
      coalesce(bool_or(r.has_hr), false) as used_hr,
      exists (
        select 1 from linked l
        join subscriptions s on s.user_id = l.user_id
        where l.anonymous_user_id = f.anonymous_user_id
          and s.tier = 'pro' and s.status in ('active', 'trialing')
      ) as is_pro
    from firsts f
    left join runs r on r.anonymous_user_id = f.anonymous_user_id
    group by f.anonymous_user_id, f.second_at
  )
  select
    case when used_hr then 'Heart rate' else 'No heart rate' end as cohort,
    count(*)::int as runners,
    round(count(*) filter (where returned)::numeric / count(*) * 100, 1) as second_run_pct,
    round(sum(run_count)::numeric / nullif(sum(active_weeks), 0), 2) as runs_per_active_week,
    round(count(*) filter (where is_pro)::numeric / count(*) * 100, 1) as pro_pct
  from per_runner
  group by used_hr
  order by used_hr desc;
$$ language sql security definer set search_path = public;

revoke execute on function hr_feature_stats(int) from public, anon, authenticated;
revoke execute on function hr_retention_comparison(int) from public, anon, authenticated;
grant execute on function hr_feature_stats(int) to service_role;
grant execute on function hr_retention_comparison(int) to service_role;
