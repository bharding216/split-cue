-- Unique devices by country and platform over the last N days.
-- Country comes from the latest app_opened, like users_by_country. Platform
-- falls back to the devices table for opens from builds that predate
-- events.platform.
create or replace function users_by_country_platform(num_days int default 30)
returns table(country text, platform text, user_count int) as $$
  with latest as (
    select distinct on (anonymous_user_id)
      anonymous_user_id,
      country,
      platform
    from events
    where event_name = 'app_opened'
      and created_at > now() - (num_days || ' days')::interval
    order by anonymous_user_id, created_at desc
  )
  select
    coalesce(nullif(l.country, ''), d.country, 'unknown') as country,
    coalesce(l.platform, d.platform, 'unknown') as platform,
    count(*)::int as user_count
  from latest l
  left join devices d on d.anonymous_user_id = l.anonymous_user_id
  group by 1, 2
  order by user_count desc, country, platform;
$$ language sql security definer;

revoke execute on function users_by_country_platform(int) from public, anon, authenticated;
grant execute on function users_by_country_platform(int) to service_role;

-- Google Play purchases from the Android app.
alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions add constraint subscriptions_provider_check
  check (provider in ('apple', 'google', 'stripe', 'manual'));
