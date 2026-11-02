-- AI training plans broken down by user (last N days).
-- Excludes the 'custom' calendar plans created for manually scheduled workouts.
-- "Accepted" matches training_plan_stats: >= 1 plan workout completed.
create or replace function training_plans_by_user(num_days int default 30)
returns table(
  user_id uuid,
  display_name text,
  plan_count int,
  accepted_count int,
  latest_at timestamptz
) as $$
  select
    tp.user_id,
    coalesce(p.display_name, u.email, tp.user_id::text) as display_name,
    count(*)::int as plan_count,
    count(*) filter (where exists (
      select 1 from plan_workouts pw
      where pw.plan_id = tp.id and pw.status = 'completed'
    ))::int as accepted_count,
    max(tp.created_at) as latest_at
  from training_plans tp
  left join profiles p on p.id = tp.user_id
  left join auth.users u on u.id = tp.user_id
  where tp.race_type <> 'custom'
    and tp.created_at > now() - (num_days || ' days')::interval
  group by tp.user_id, p.display_name, u.email
  order by plan_count desc, latest_at desc;
$$ language sql security definer;
