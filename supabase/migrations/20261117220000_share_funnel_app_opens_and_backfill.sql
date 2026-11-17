-- 1. Backfill share_type from the workout_data payload for older rows that
--    were inserted before the app set share_type. The v2 payload stores the
--    kind in the 'k' field.
update shared_workouts
set share_type = workout_data->>'k'
where share_type is null
  and workout_data->>'k' in ('structure', 'planned', 'results', 'challenge', 'achievement');

-- 2. Rebuild share_funnel to include app_opens (Universal Links / App Links
--    bypass the landing page, so 'app_open' events are the only signal for
--    recipients who already have the app).
drop function if exists public.share_funnel(int);
create or replace function public.share_funnel(num_days int default 30)
returns table(
  share_type text,
  shares int,
  sharers int,
  with_image int,
  opens int,
  app_opens int,
  store_clicks int,
  imports int,
  deferred_installs int,
  completions int,
  activated_runners int,
  reshares int,
  activated_per_sharer numeric
) as $$
  with shares as (
    select sw.code, coalesce(sw.share_type, 'unknown') as share_type, sw.image_path,
      coalesce(sw.user_id::text, sw.anonymous_id) as sharer
    from shared_workouts sw
    where sw.created_at > now() - (num_days || ' days')::interval
  ),
  ev as (
    select e.share_code, e.event_type, e.anonymous_id, e.referrer
    from share_events e
    join shares s on s.code = e.share_code
  )
  select
    case when grouping(s.share_type) = 1 then 'all' else s.share_type end as share_type,
    count(distinct s.code)::int as shares,
    count(distinct s.sharer)::int as sharers,
    count(distinct s.code) filter (where s.image_path is not null)::int as with_image,
    count(ev.*) filter (where ev.event_type = 'open')::int as opens,
    count(ev.*) filter (where ev.event_type = 'app_open')::int as app_opens,
    count(ev.*) filter (where ev.event_type = 'store_click')::int as store_clicks,
    count(ev.*) filter (where ev.event_type = 'import')::int as imports,
    count(distinct ev.anonymous_id) filter (where ev.event_type = 'import' and ev.referrer = 'deferred')::int
      as deferred_installs,
    count(ev.*) filter (where ev.event_type = 'complete')::int as completions,
    count(distinct ev.anonymous_id) filter (where ev.event_type = 'complete')::int as activated_runners,
    count(ev.*) filter (where ev.event_type = 'reshare')::int as reshares,
    round(
      (count(distinct ev.anonymous_id) filter (where ev.event_type = 'complete'))::numeric
        / nullif(count(distinct s.sharer), 0),
      3
    ) as activated_per_sharer
  from shares s
  left join ev on ev.share_code = s.code
  group by rollup(s.share_type)
  order by grouping(s.share_type), shares desc;
$$ language sql security definer set search_path = public;

revoke execute on function public.share_funnel(int) from public, anon, authenticated;
grant execute on function public.share_funnel(int) to service_role;
