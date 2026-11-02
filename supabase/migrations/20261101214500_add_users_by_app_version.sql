-- Unique devices by app version over the last N days.
-- Uses the latest app_opened version so each device is counted once.
create or replace function users_by_app_version(num_days int default 30)
returns table(app_version text, user_count int) as $$
  with latest as (
    select distinct on (anonymous_user_id)
      anonymous_user_id,
      app_version
    from events
    where event_name = 'app_opened'
      and created_at > now() - (num_days || ' days')::interval
    order by anonymous_user_id, created_at desc
  )
  select
    coalesce(nullif(app_version, ''), 'unknown') as app_version,
    count(*)::int as user_count
  from latest
  group by 1
  order by user_count desc, app_version;
$$ language sql security definer;
