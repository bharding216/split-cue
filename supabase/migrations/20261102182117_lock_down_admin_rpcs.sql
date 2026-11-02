-- The admin dashboard is the only caller of these reporting functions and uses
-- the service-role key. They are security definer and several return user
-- emails, so the anon/authenticated roles (the mobile app's public key) must
-- not be able to call them.

drop function if exists power_users(int, int);

revoke execute on function activation_rate() from public, anon, authenticated;
revoke execute on function ai_adoption_rate(int) from public, anon, authenticated;
revoke execute on function ai_generations_by_user(int) from public, anon, authenticated;
revoke execute on function ai_generations_count(int) from public, anon, authenticated;
revoke execute on function core_engagement_rate() from public, anon, authenticated;
revoke execute on function dau_per_day(int) from public, anon, authenticated;
revoke execute on function dau_today() from public, anon, authenticated;
revoke execute on function events_per_day(int) from public, anon, authenticated;
revoke execute on function free_to_paid_rate() from public, anon, authenticated;
revoke execute on function new_users(int) from public, anon, authenticated;
revoke execute on function onboarding_funnel(int) from public, anon, authenticated;
revoke execute on function pro_subscribers() from public, anon, authenticated;
revoke execute on function share_stats(int) from public, anon, authenticated;
revoke execute on function shares_by_user(int) from public, anon, authenticated;
revoke execute on function shares_per_day(int) from public, anon, authenticated;
revoke execute on function signups_per_day(int) from public, anon, authenticated;
revoke execute on function todays_events_by_user() from public, anon, authenticated;
revoke execute on function total_users() from public, anon, authenticated;
revoke execute on function training_plan_stats(int) from public, anon, authenticated;
revoke execute on function training_plans_by_user(int) from public, anon, authenticated;
revoke execute on function users_by_app_version(int) from public, anon, authenticated;
revoke execute on function users_by_country(int) from public, anon, authenticated;
revoke execute on function wau() from public, anon, authenticated;
revoke execute on function week4_retention() from public, anon, authenticated;
revoke execute on function workout_completion_stats(int) from public, anon, authenticated;
revoke execute on function workout_retention_curve(int) from public, anon, authenticated;

grant execute on function activation_rate() to service_role;
grant execute on function ai_adoption_rate(int) to service_role;
grant execute on function ai_generations_by_user(int) to service_role;
grant execute on function ai_generations_count(int) to service_role;
grant execute on function core_engagement_rate() to service_role;
grant execute on function dau_per_day(int) to service_role;
grant execute on function dau_today() to service_role;
grant execute on function events_per_day(int) to service_role;
grant execute on function free_to_paid_rate() to service_role;
grant execute on function new_users(int) to service_role;
grant execute on function onboarding_funnel(int) to service_role;
grant execute on function pro_subscribers() to service_role;
grant execute on function share_stats(int) to service_role;
grant execute on function shares_by_user(int) to service_role;
grant execute on function shares_per_day(int) to service_role;
grant execute on function signups_per_day(int) to service_role;
grant execute on function todays_events_by_user() to service_role;
grant execute on function total_users() to service_role;
grant execute on function training_plan_stats(int) to service_role;
grant execute on function training_plans_by_user(int) to service_role;
grant execute on function users_by_app_version(int) to service_role;
grant execute on function users_by_country(int) to service_role;
grant execute on function wau() to service_role;
grant execute on function week4_retention() to service_role;
grant execute on function workout_completion_stats(int) to service_role;
grant execute on function workout_retention_curve(int) to service_role;
