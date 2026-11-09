-- Retention dashboard fixes.
--
-- second_run_retention: a cohort only gets a 7 / 14 / 30-day rate once its
-- whole week is that old. Counting runner by runner let a cohort show a rate
-- from the handful who ran on its first morning (e.g. 4/4 = 100%).
--
-- run_ladder replaces workout_retention_curve, which had no time window and
-- counted a restart minutes after a stopped run as a second run.

-- ── Second-run retention by weekly cohort ─────────────────────────────
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
  with f as (
    select date_trunc('week', first_at) as wk, first_at, second_at
    from first_run_returns
    where first_at > date_trunc('week', now()) - (cohort_weeks || ' weeks')::interval
  )
  select
    to_char(wk, 'YYYY-MM-DD') as cohort,
    count(*)::int as first_runners,
    (case when wk + interval '14 days' <= now() then count(*) else 0 end)::int,
    (case when wk + interval '14 days' <= now()
      then count(*) filter (where second_at <= first_at + interval '7 days') else 0 end)::int,
    (case when wk + interval '21 days' <= now() then count(*) else 0 end)::int,
    (case when wk + interval '21 days' <= now()
      then count(*) filter (where second_at <= first_at + interval '14 days') else 0 end)::int,
    (case when wk + interval '37 days' <= now() then count(*) else 0 end)::int,
    (case when wk + interval '37 days' <= now()
      then count(*) filter (where second_at <= first_at + interval '30 days') else 0 end)::int
  from f
  group by wk
  order by wk;
$$ language sql security definer set search_path = public, pg_temp;

-- ── Run ladder ────────────────────────────────────────────────────────
-- Of runners whose first run was at least window_days ago, how many reached
-- run 2, 3, 4, 5 within window_days. Runs less than 6 hours after the
-- previous qualifying run merge into one session.
drop function if exists workout_retention_curve(int);
drop function if exists run_ladder(int);
create or replace function run_ladder(window_days int default 14)
returns table(step int, eligible int, reached int) as $$
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
      created_at,
      row_number() over (partition by anonymous_user_id order by created_at) as n
    from q
    where prev_at is null or created_at >= prev_at + interval '6 hours'
  ),
  firsts as (
    select anonymous_user_id, created_at as first_at
    from sessions
    where n = 1
      and created_at <= now() - (window_days || ' days')::interval
  ),
  tops as (
    select f.anonymous_user_id, max(s.n) as top
    from firsts f
    join sessions s on s.anonymous_user_id = f.anonymous_user_id
    where s.created_at <= f.first_at + (window_days || ' days')::interval
    group by f.anonymous_user_id
  )
  select
    st.step,
    (select count(*) from firsts)::int as eligible,
    count(t.anonymous_user_id)::int as reached
  from generate_series(1, 5) as st(step)
  left join tops t on t.top >= st.step
  group by st.step
  order by st.step;
$$ language sql security definer set search_path = public, pg_temp;

-- ── Access control ────────────────────────────────────────────────────
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'second_run_retention(int)',
    'run_ladder(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
