-- Callable with the public key, anyone could raise another user's monthly AI
-- usage counter. Only server-side code (service role) may call it.
revoke execute on function increment_ai_workouts(uuid) from public, anon, authenticated;
grant execute on function increment_ai_workouts(uuid) to service_role;
