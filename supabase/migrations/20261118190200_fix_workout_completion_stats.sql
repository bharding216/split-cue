-- Fix workout_completion_stats: add production filter and exclude test devices.
-- Without these filters, dev/preview builds and test devices skew the counts.

drop function if exists workout_completion_stats(int);
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
      and environment = 'production'
      and anonymous_user_id not in (select anonymous_user_id from analytics_excluded_devices)
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
$$ language sql security definer
   set search_path = public, pg_temp;
