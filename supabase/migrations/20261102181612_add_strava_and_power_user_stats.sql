-- Strava adoption and power-user analytics for the admin dashboard.
-- Push counts come from the client's strava_workout_pushed events, which are
-- only sent after a successful upload; pushes before that event shipped are
-- not counted.

drop function if exists strava_stats(int);
drop function if exists strava_users(int);
drop function if exists power_users(int, int);

-- Strava summary: connected accounts (current) plus activity in the last N days.
create or replace function strava_stats(num_days int default 30)
returns table(
  connected_users int,
  connected_pct numeric,
  new_connections int,
  disconnects int,
  pushes int,
  auto_pushes int,
  unique_pushers int
) as $$
  with connections as (
    select
      count(*)::int as connected_users,
      count(*) filter (
        where connected_at > now() - (num_days || ' days')::interval
      )::int as new_connections
    from strava_connections
  ),
  activity as (
    select
      count(*) filter (where event_name = 'strava_disconnected')::int as disconnects,
      count(*) filter (where event_name = 'strava_workout_pushed')::int as pushes,
      count(*) filter (
        where event_name = 'strava_workout_pushed' and metadata->>'trigger' = 'auto'
      )::int as auto_pushes,
      count(distinct coalesce(user_id::text, anonymous_user_id)) filter (
        where event_name = 'strava_workout_pushed'
      )::int as unique_pushers
    from events
    where event_name in ('strava_workout_pushed', 'strava_disconnected')
      and created_at > now() - (num_days || ' days')::interval
  ),
  total as (
    select count(*) as n from profiles
  )
  select
    c.connected_users,
    case
      when total.n = 0 then 0
      else round(c.connected_users::numeric / total.n::numeric * 100, 1)
    end as connected_pct,
    c.new_connections,
    a.disconnects,
    a.pushes,
    a.auto_pushes,
    a.unique_pushers
  from connections c, activity a, total;
$$ language sql security definer;

-- Every user who is connected to Strava or has ever pushed a workout,
-- with all-time and last-N-days push counts.
create or replace function strava_users(num_days int default 30)
returns table(
  user_id uuid,
  display_name text,
  athlete_name text,
  is_connected boolean,
  connected_at timestamptz,
  push_count int,
  pushes_period int,
  auto_push_count int,
  latest_push_at timestamptz
) as $$
  with pushes as (
    select
      e.user_id,
      count(*)::int as push_count,
      count(*) filter (
        where e.created_at > now() - (num_days || ' days')::interval
      )::int as pushes_period,
      count(*) filter (where e.metadata->>'trigger' = 'auto')::int as auto_push_count,
      max(e.created_at) as latest_push_at
    from events e
    where e.event_name = 'strava_workout_pushed'
      and e.user_id is not null
    group by e.user_id
  ),
  people as (
    select sc.user_id from strava_connections sc
    union
    select pu.user_id from pushes pu
  )
  select
    pp.user_id,
    coalesce(p.display_name, u.email, pp.user_id::text) as display_name,
    sc.athlete_name,
    sc.user_id is not null as is_connected,
    sc.connected_at,
    coalesce(pu.push_count, 0) as push_count,
    coalesce(pu.pushes_period, 0) as pushes_period,
    coalesce(pu.auto_push_count, 0) as auto_push_count,
    pu.latest_push_at
  from people pp
  left join strava_connections sc on sc.user_id = pp.user_id
  left join pushes pu on pu.user_id = pp.user_id
  left join profiles p on p.id = pp.user_id
  left join auth.users u on u.id = pp.user_id
  order by push_count desc, sc.connected_at desc nulls last;
$$ language sql security definer;

-- Users ranked by completed workouts in the last N days. A power user has
-- completed at least min_workouts. Events from a device are attributed to the
-- account that device most recently signed in as, so pre-sign-in workouts
-- count toward the account; never-signed-in devices are listed on their own.
create or replace function power_users(num_days int default 30, min_workouts int default 8)
returns table(
  user_key text,
  user_id uuid,
  display_name text,
  workouts_completed int,
  active_days int,
  last_completed_at timestamptz,
  is_pro boolean,
  strava_connected boolean,
  strava_pushes int,
  is_power_user boolean
) as $$
  with linked as (
    select distinct on (anonymous_user_id) anonymous_user_id, user_id
    from events
    where user_id is not null
    order by anonymous_user_id, created_at desc
  ),
  activity as (
    select
      coalesce(e.user_id, l.user_id) as user_id,
      e.anonymous_user_id,
      e.event_name,
      e.created_at
    from events e
    left join linked l on l.anonymous_user_id = e.anonymous_user_id
    where e.event_name in ('workout_completed', 'strava_workout_pushed')
      and e.created_at > now() - (num_days || ' days')::interval
  ),
  per_user as (
    select
      coalesce(user_id::text, anonymous_user_id) as user_key,
      user_id,
      count(*) filter (where event_name = 'workout_completed')::int as workouts_completed,
      count(distinct created_at::date) filter (
        where event_name = 'workout_completed'
      )::int as active_days,
      max(created_at) filter (where event_name = 'workout_completed') as last_completed_at,
      count(*) filter (where event_name = 'strava_workout_pushed')::int as strava_pushes
    from activity
    group by 1, 2
  )
  select
    pu.user_key,
    pu.user_id,
    coalesce(p.display_name, u.email, 'Anonymous device ' || left(pu.user_key, 8)) as display_name,
    pu.workouts_completed,
    pu.active_days,
    pu.last_completed_at,
    exists (
      select 1 from subscriptions s
      where s.user_id = pu.user_id
        and s.tier = 'pro'
        and s.status in ('active', 'trialing')
    ) as is_pro,
    exists (
      select 1 from strava_connections sc where sc.user_id = pu.user_id
    ) as strava_connected,
    pu.strava_pushes,
    pu.workouts_completed >= min_workouts as is_power_user
  from per_user pu
  left join profiles p on p.id = pu.user_id
  left join auth.users u on u.id = pu.user_id
  where pu.workouts_completed > 0
  order by pu.workouts_completed desc, pu.active_days desc, pu.last_completed_at desc;
$$ language sql security definer;

-- These expose emails, so only the admin dashboard's service-role client may call them.
revoke execute on function strava_stats(int) from public, anon, authenticated;
revoke execute on function strava_users(int) from public, anon, authenticated;
revoke execute on function power_users(int, int) from public, anon, authenticated;
grant execute on function strava_stats(int) to service_role;
grant execute on function strava_users(int) to service_role;
grant execute on function power_users(int, int) to service_role;
