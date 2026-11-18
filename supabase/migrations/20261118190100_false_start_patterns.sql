-- False start patterns: aggregate restart data to help diagnose onboarding friction.
-- Shows how often runners abandon and restart, what they change, and how quickly.

drop function if exists false_start_patterns(int);
create or replace function false_start_patterns(num_days int default 30)
returns table(
  total_restarts int,
  unique_restarters int,
  same_workout_pct numeric,
  median_seconds_to_restart numeric,
  top_workout_changes jsonb,
  restart_by_run_number jsonb
) as $$
  with restarts as (
    select
      e.anonymous_user_id,
      e.metadata,
      coalesce((e.metadata->>'seconds_since_stop')::numeric, 0) as seconds_since_stop,
      coalesce(e.metadata->>'same_workout_name', 'false') = 'true' as same_name
    from events e
    where e.environment = 'production'
      and e.event_name = 'workout_restarted'
      and e.created_at > now() - (num_days || ' days')::interval
      and e.anonymous_user_id not in (select anonymous_user_id from analytics_excluded_devices)
  ),
  workout_change_items as (
    select jsonb_array_elements_text(r.metadata->'workout_changes') as change_field
    from restarts r
    where jsonb_typeof(r.metadata->'workout_changes') = 'array'
  ),
  change_counts as (
    select change_field, count(*)::int as cnt
    from workout_change_items
    group by change_field
    order by cnt desc
    limit 10
  ),
  -- Count restarts per prior run count to see if false starts cluster at onboarding
  by_run_number as (
    select
      case
        when (r.metadata->>'previous_elapsed_ms')::numeric < 60000 then 'under_1_min'
        else 'over_1_min'
      end as bucket,
      count(*)::int as cnt
    from restarts r
    group by 1
  ),
  stats as (
    select
      count(*)::int as total_restarts,
      count(distinct anonymous_user_id)::int as unique_restarters,
      round(
        count(*) filter (where same_name)::numeric / nullif(count(*), 0) * 100,
        1
      ) as same_workout_pct,
      round((percentile_cont(0.5) within group (order by seconds_since_stop))::numeric, 0) as median_seconds_to_restart
    from restarts
  )
  select
    s.total_restarts,
    s.unique_restarters,
    s.same_workout_pct,
    s.median_seconds_to_restart,
    coalesce(
      (select jsonb_object_agg(c.change_field, c.cnt) from change_counts c),
      '{}'::jsonb
    ) as top_workout_changes,
    coalesce(
      (select jsonb_object_agg(b.bucket, b.cnt) from by_run_number b),
      '{}'::jsonb
    ) as restart_by_run_number
  from stats s;
$$ language sql security definer
   set search_path = public, pg_temp;

revoke execute on function false_start_patterns(int) from public, anon, authenticated;
grant execute on function false_start_patterns(int) to service_role;
