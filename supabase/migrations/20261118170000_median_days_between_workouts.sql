-- Median days between workouts across all users with ≥ 2 workout sessions.
-- Sessions merge qualifying runs less than 6 hours apart (same as run_ladder).
-- For each user the median gap between consecutive sessions is computed,
-- then the overall median of those per-user medians is returned.

drop function if exists median_days_between_workouts();
create or replace function median_days_between_workouts()
returns table(median_days numeric, user_count int) as $$
  with q as (
    select
      anonymous_user_id,
      created_at,
      lag(created_at) over (partition by anonymous_user_id order by created_at) as prev_at
    from qualifying_runs
  ),
  sessions as (
    select
      anonymous_user_id,
      created_at
    from q
    where prev_at is null or created_at >= prev_at + interval '6 hours'
  ),
  gaps as (
    select
      anonymous_user_id,
      extract(epoch from (
        created_at - lag(created_at) over (partition by anonymous_user_id order by created_at)
      )) / 86400.0 as gap_days
    from sessions
  ),
  user_medians as (
    select
      anonymous_user_id,
      percentile_cont(0.5) within group (order by gap_days) as median_gap
    from gaps
    where gap_days is not null
    group by anonymous_user_id
  )
  select
    round(percentile_cont(0.5) within group (order by median_gap)::numeric, 1) as median_days,
    count(*)::int as user_count
  from user_medians;
$$ language sql security definer set search_path = public, pg_temp;

-- Lock down access: only the admin dashboard's service-role client may call this.
revoke execute on function median_days_between_workouts() from public, anon, authenticated;
grant execute on function median_days_between_workouts() to service_role;
