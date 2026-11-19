-- Admin dashboard cards for the UX improvements shipped from user timeline analysis.
-- Tracks GPS-denied workout rate, HR scan outcomes, device-not-listed reports,
-- workout picker engagement, and adds location-access dimension to first-run breakdown.

-- ── 1. GPS-Denied Workout Stats ─────────────────────────────────────
-- Workouts started with GPS enabled but location blocked (zero samples).
drop function if exists gps_denied_workout_stats(int);
create or replace function gps_denied_workout_stats(num_days int default 30)
returns table(
  total_gps_workouts int,
  gps_denied_workouts int,
  denied_pct numeric,
  gps_no_fix_workouts int,
  no_fix_pct numeric
) as $$
  with ended as (
    select
      e.anonymous_user_id,
      e.metadata
    from events e
    where e.environment = 'production'
      and e.event_name in ('workout_completed', 'workout_abandoned')
      and e.created_at > now() - (num_days || ' days')::interval
      and (e.metadata->>'gps_enabled')::boolean = true
      and not exists (
        select 1 from analytics_excluded_devices x
        where x.anonymous_user_id = e.anonymous_user_id
      )
  ),
  counts as (
    select
      count(*)::int as total,
      count(*) filter (
        where (metadata->>'gps_sample_count')::int = 0
      )::int as no_samples,
      count(*) filter (
        where (metadata->>'gps_sample_count')::int = 0
          and coalesce((metadata->>'gps_expected_samples')::int, 0) > 0
      )::int as denied
    from ended
  )
  select
    c.total,
    c.denied,
    case when c.total = 0 then 0
      else round(c.denied::numeric / c.total * 100, 1) end,
    c.no_samples - c.denied,
    case when c.total = 0 then 0
      else round((c.no_samples - c.denied)::numeric / c.total * 100, 1) end
  from counts c;
$$ language sql security definer set search_path = public;

-- ── 2. HR Scan Outcome Funnel ───────────────────────────────────────
-- hr_scan_empty fires when a scan times out or the user stops it with no
-- devices found. hr_device_connected fires on successful pair. Together
-- they approximate total scan outcomes. Grouped by the guide that was
-- active at the time (null → 'none').
drop function if exists hr_scan_funnel(int);
create or replace function hr_scan_funnel(num_days int default 30)
returns table(
  guide_kind text,
  scans_found int,
  scans_empty int,
  total_scans int,
  success_pct numeric
) as $$
  with scan_events as (
    select
      e.event_name,
      coalesce(e.metadata->>'guide', 'none') as guide_id
    from events e
    where e.environment = 'production'
      and e.event_name in ('hr_scan_empty', 'hr_device_connected')
      and e.created_at > now() - (num_days || ' days')::interval
      and not exists (
        select 1 from analytics_excluded_devices x
        where x.anonymous_user_id = e.anonymous_user_id
      )
  ),
  classified as (
    select
      case
        when guide_id in ('polar', 'garmin-strap', 'wahoo', 'other-strap') then 'strap'
        when guide_id in ('garmin-watch', 'amazfit', 'coros', 'whoop') then 'watch'
        when guide_id in ('apple-watch', 'other-watch') then 'limited'
        else 'none'
      end as kind,
      event_name
    from scan_events
  )
  select
    kind as guide_kind,
    count(*) filter (where event_name = 'hr_device_connected')::int as scans_found,
    count(*) filter (where event_name = 'hr_scan_empty')::int as scans_empty,
    count(*)::int as total_scans,
    case when count(*) = 0 then 0
      else round(
        count(*) filter (where event_name = 'hr_device_connected')::numeric / count(*) * 100, 1
      ) end as success_pct
  from classified
  group by kind
  order by total_scans desc;
$$ language sql security definer set search_path = public;

-- ── 3. HR Device Not Listed Reports ─────────────────────────────────
drop function if exists hr_not_listed_reports(int);
create or replace function hr_not_listed_reports(num_days int default 30)
returns table(
  total_reports int,
  unique_reporters int,
  device_names jsonb
) as $$
  with reports as (
    select
      e.anonymous_user_id,
      e.metadata->>'device_name' as device_name,
      e.metadata->>'device_type' as device_type
    from events e
    where e.environment = 'production'
      and e.event_name = 'hr_device_not_listed'
      and e.created_at > now() - (num_days || ' days')::interval
      and not exists (
        select 1 from analytics_excluded_devices x
        where x.anonymous_user_id = e.anonymous_user_id
      )
  )
  select
    count(*)::int as total_reports,
    count(distinct anonymous_user_id)::int as unique_reporters,
    coalesce(
      jsonb_agg(
        jsonb_build_object('name', device_name, 'type', device_type)
        order by device_name
      ) filter (where device_name is not null),
      '[]'::jsonb
    ) as device_names
  from reports;
$$ language sql security definer set search_path = public;

-- ── 4. Workout Picker Engagement ────────────────────────────────────
drop function if exists workout_picker_stats(int);
create or replace function workout_picker_stats(num_days int default 30)
returns table(
  opens int,
  dismissals int,
  dismiss_rate numeric,
  median_dwell_ms numeric,
  unique_openers int,
  unique_dismissers int
) as $$
  with picker as (
    select
      e.anonymous_user_id,
      e.event_name,
      e.metadata
    from events e
    where e.environment = 'production'
      and e.event_name in ('workout_picker_opened', 'workout_picker_dismissed')
      and e.created_at > now() - (num_days || ' days')::interval
      and not exists (
        select 1 from analytics_excluded_devices x
        where x.anonymous_user_id = e.anonymous_user_id
      )
  ),
  counts as (
    select
      count(*) filter (where event_name = 'workout_picker_opened')::int as opens,
      count(*) filter (where event_name = 'workout_picker_dismissed')::int as dismissals,
      count(distinct anonymous_user_id) filter (where event_name = 'workout_picker_opened')::int as unique_openers,
      count(distinct anonymous_user_id) filter (where event_name = 'workout_picker_dismissed')::int as unique_dismissers
    from picker
  ),
  dwell as (
    select percentile_cont(0.5) within group (
      order by (metadata->>'dwell_ms')::numeric
    ) as median_ms
    from picker
    where event_name = 'workout_picker_dismissed'
      and metadata ? 'dwell_ms'
  )
  select
    c.opens,
    c.dismissals,
    case when c.opens = 0 then 0
      else round(c.dismissals::numeric / c.opens * 100, 1) end,
    coalesce(d.median_ms, 0),
    c.unique_openers,
    c.unique_dismissers
  from counts c, dwell d;
$$ language sql security definer set search_path = public;

-- ── 5. Location Access dimension in first_run_breakdown ─────────────
-- We add a 'Location access' dimension to the existing first_run_breakdown.
-- The location_access field is on the first_run_check_shown event, not on the
-- workout event itself. So we join to the closest first_run_check_shown event
-- for that device. Since first_run_breakdown uses first_metadata from the
-- qualifying run, we add the dimension using the workout_started event's
-- settings -> gps_enabled combined with gps_sample_count = 0 as a proxy.
-- This is already partially covered by the GPS dimension; the new dimension
-- makes the interpretation explicit: "blocked" vs "granted" vs "not needed".

-- We update first_run_breakdown to include this new dimension by replacing it.
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
      ) as planned_next,
      -- Location access from the closest first_run_check_shown event
      (
        select chk.metadata->>'location_access'
        from events chk
        where chk.anonymous_user_id = f.anonymous_user_id
          and chk.event_name = 'first_run_check_shown'
          and chk.created_at between f.first_at - interval '1 hour' and f.first_at + interval '5 minutes'
        order by chk.created_at desc
        limit 1
      ) as location_access
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
      ('Location access', coalesce(b.location_access, 'unknown')),
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
$$ language sql security definer set search_path = public;

-- ── Access control ──────────────────────────────────────────────────
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'gps_denied_workout_stats(int)',
    'hr_scan_funnel(int)',
    'hr_not_listed_reports(int)',
    'workout_picker_stats(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
