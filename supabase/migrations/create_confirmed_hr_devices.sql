-- Heart rate monitor models with successful recordings, for the "Confirmed working"
-- list on splitcue.app/help/heart-rate-monitors.
--
-- Built from `hr_recording_saved` events (a workout saved with at least a minute of
-- heart rate). Serial suffixes are stripped from Bluetooth names ("Polar H10 8A2B3C4D"
-- becomes "Polar H10"). A model is listed only once two different people have recorded
-- with it in production, so a monitor someone renamed after themselves never appears.
--
-- Runs as the owner so the website's anon key can read the list without access to events.

create or replace function public.confirmed_hr_devices()
returns table (model text, people bigint)
language sql
stable
security definer
set search_path = public
as $$
  with recordings as (
    select
      btrim(regexp_replace(
        regexp_replace(metadata->>'device_name', '\s*[:#]\s*\S+$', ''),
        '[\s_-]+(?=[0-9A-Fa-f]*[0-9])[0-9A-Fa-f]{4,}$', ''
      )) as model,
      coalesce(user_id::text, anonymous_user_id) as person
    from events
    where event_name = 'hr_recording_saved'
      and environment = 'production'
      and metadata->>'device_name' is not null
  )
  select model, count(distinct person) as people
  from recordings
  where length(model) between 2 and 40
    and model !~* '^heart rate monitor$'
    and model !~ '[''’]'
  group by model
  having count(distinct person) >= 2
  order by people desc, model
  limit 60;
$$;

revoke all on function public.confirmed_hr_devices() from public;
grant execute on function public.confirmed_hr_devices() to anon, authenticated;
