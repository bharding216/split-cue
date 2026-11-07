-- Pin search_path on the security-definer retention functions so a caller
-- can't shadow the tables they read (Supabase lint 0011).
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
    'workout_retention_curve(int)',
    'lapsed_survey_summary(int)',
    'lapsed_survey_comments(int, int)',
    'run_reminder_funnel(int)'
  ] loop
    execute format('alter function %s set search_path = public, pg_temp', fn);
  end loop;
end;
$$;
