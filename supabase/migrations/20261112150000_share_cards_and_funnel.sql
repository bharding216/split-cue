-- Sharing growth loop: card images for link previews, and funnel counters.

alter table public.shared_workouts
  add column if not exists image_path text,
  add column if not exists open_count integer not null default 0,
  add column if not exists import_count integer not null default 0,
  add column if not exists completion_count integer not null default 0;

-- Only a card stored under the share's own code can be referenced.
alter table public.shared_workouts
  drop constraint if exists shared_workouts_image_path_check;
alter table public.shared_workouts
  add constraint shared_workouts_image_path_check
  check (image_path is null or image_path = code || '.png');

-- Public bucket of share card images named <code>.png. Anyone can read by URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-cards', 'share-cards', true, 2097152, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Guests share too, so anyone can upload a new card. There's no update or
-- delete policy, so an existing card can't be replaced.
drop policy if exists "Anyone can upload share cards" on storage.objects;
create policy "Anyone can upload share cards"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'share-cards'
    and name ~ '^[A-Za-z0-9]{4,16}\.png$'
  );

-- Counts landing page opens, app imports, and completed runs of a share.
-- Callers can't write shared_workouts directly; this only increments counters.
create or replace function public.record_share_event(share_code text, event_kind text)
returns void
language sql
security definer
set search_path = public
as $$
  update shared_workouts set
    open_count = open_count + (event_kind = 'open')::int,
    import_count = import_count + (event_kind = 'import')::int,
    completion_count = completion_count + (event_kind = 'complete')::int
  where code = share_code
    and event_kind in ('open', 'import', 'complete');
$$;

revoke all on function public.record_share_event(text, text) from public;
grant execute on function public.record_share_event(text, text) to anon, authenticated, service_role;

-- Admin: share funnel by share type. Same definition as admin/supabase-rpcs.sql.
create or replace function public.share_funnel(num_days int default 30)
returns table(
  share_type text,
  shares int,
  with_image int,
  opens int,
  imports int,
  completions int,
  imports_per_share numeric
) as $$
  select
    case when grouping(share_type) = 1 then 'all' else coalesce(share_type, 'unknown') end as share_type,
    count(*)::int as shares,
    count(*) filter (where image_path is not null)::int as with_image,
    coalesce(sum(open_count), 0)::int as opens,
    coalesce(sum(import_count), 0)::int as imports,
    coalesce(sum(completion_count), 0)::int as completions,
    round(coalesce(sum(import_count), 0)::numeric / nullif(count(*), 0), 3) as imports_per_share
  from shared_workouts
  where created_at > now() - (num_days || ' days')::interval
  group by rollup(share_type)
  order by grouping(share_type), shares desc;
$$ language sql security definer set search_path = public;

revoke execute on function public.share_funnel(int) from public, anon, authenticated;
grant execute on function public.share_funnel(int) to service_role;
