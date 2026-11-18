-- Suggestion return rate: measures whether runners come back on the suggested
-- date (any workout) and whether they complete the suggested workout itself.
--
-- Returns two rows:
--   "Saw suggestion"          – unique devices shown next_run_suggestion_shown
--   "Returned on date"        – ran any qualifying workout within ±1 day of the suggested date
--   "Ran suggested workout"   – the qualifying run's workout_origin = 'next_run_suggestion'

drop function if exists suggestion_return_rate(int);
create or replace function suggestion_return_rate(num_days int default 30)
returns table(step text, user_count int) as $$
  with suggestions as (
    select
      e.anonymous_user_id,
      (e.metadata->>'suggested_date')::date as suggested_date
    from events e
    where e.environment = 'production'
      and e.event_name = 'next_run_suggestion_shown'
      and e.metadata->>'suggested_date' is not null
      and e.created_at > now() - (num_days || ' days')::interval
      and e.anonymous_user_id not in (select anonymous_user_id from analytics_excluded_devices)
  ),
  distinct_suggestions as (
    select distinct on (anonymous_user_id, suggested_date)
      anonymous_user_id,
      suggested_date
    from suggestions
  ),
  runs as (
    select
      q.anonymous_user_id,
      q.created_at::date as run_date,
      q.metadata->>'workout_origin' as workout_origin
    from qualifying_runs q
    where q.created_at > now() - ((num_days + 2) || ' days')::interval
  ),
  matched as (
    select
      ds.anonymous_user_id,
      ds.suggested_date,
      bool_or(r.run_date between ds.suggested_date - 1 and ds.suggested_date + 1) as returned_any,
      bool_or(
        r.run_date between ds.suggested_date - 1 and ds.suggested_date + 1
        and r.workout_origin = 'next_run_suggestion'
      ) as returned_suggested
    from distinct_suggestions ds
    left join runs r
      on r.anonymous_user_id = ds.anonymous_user_id
    group by ds.anonymous_user_id, ds.suggested_date
  )
  select s.step, s.n::int
  from (values
    (1, 'Saw suggestion',
      (select count(distinct anonymous_user_id) from distinct_suggestions)),
    (2, 'Returned on date',
      (select count(distinct anonymous_user_id) from matched where returned_any)),
    (3, 'Ran suggested workout',
      (select count(distinct anonymous_user_id) from matched where returned_suggested))
  ) as s(ord, step, n)
  order by s.ord;
$$ language sql security definer
   set search_path = public, pg_temp;

revoke execute on function suggestion_return_rate(int) from public, anon, authenticated;
grant execute on function suggestion_return_rate(int) to service_role;
