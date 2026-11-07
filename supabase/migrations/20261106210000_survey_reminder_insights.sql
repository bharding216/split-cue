-- Lapsed-survey response rates and comments, and the run-reminder funnel,
-- for the admin Retention page. Production devices only, test devices excluded.

-- ── Lapsed survey: how many saw it, answered, commented, or closed it ──
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

-- ── Lapsed survey: free-text comments, newest first ───────────────────
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

-- ── Run reminders: asked → scheduled → opened → ran ───────────────────
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

-- ── Access control ────────────────────────────────────────────────────
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'lapsed_survey_summary(int)',
    'lapsed_survey_comments(int, int)',
    'run_reminder_funnel(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
