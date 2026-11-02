-- Missed in lock_down_admin_rpcs: dashboard-only, service role only.
revoke execute on function workouts_per_day(int) from public, anon, authenticated;
grant execute on function workouts_per_day(int) to service_role;
