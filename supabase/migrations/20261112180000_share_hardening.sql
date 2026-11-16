-- Share hardening: lock down shared_workouts, add lineage, revoke and expiry,
-- and record share funnel events one row at a time.
--
-- Builds before 1.11 read shared_workouts by code and insert into it directly,
-- so anonymous reads stay open for `code` and `workout_data` only (no owner,
-- counters, or lineage), and inserts stay open with tighter checks. Newer
-- builds use create_share and get_share. Drop the direct grants once
-- app_min_versions passes the build that switched.

-- ── Columns ─────────────────────────────────────────────────────────

alter table public.shared_workouts
  add column if not exists revoked_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists parent_code text,
  add column if not exists root_code text,
  add column if not exists visibility text not null default 'unlisted',
  add column if not exists anonymous_id text;

alter table public.shared_workouts
  drop constraint if exists shared_workouts_visibility_check;
alter table public.shared_workouts
  add constraint shared_workouts_visibility_check
  check (visibility in ('unlisted', 'public'));

alter table public.shared_workouts
  drop constraint if exists shared_workouts_share_type_check;
alter table public.shared_workouts
  add constraint shared_workouts_share_type_check
  check (share_type is null or share_type in ('structure', 'planned', 'results', 'challenge', 'achievement'));

alter table public.shared_workouts
  drop constraint if exists shared_workouts_payload_size_check;
alter table public.shared_workouts
  add constraint shared_workouts_payload_size_check
  check (octet_length(workout_data::text) <= 32768);

create index if not exists shared_workouts_user_id_idx on public.shared_workouts (user_id, created_at desc);
create index if not exists shared_workouts_anonymous_id_idx on public.shared_workouts (anonymous_id, created_at desc);
create index if not exists shared_workouts_root_code_idx on public.shared_workouts (root_code);

-- ── Direct access (older builds) ────────────────────────────────────

drop policy if exists "Anyone can read shared workouts" on public.shared_workouts;
drop policy if exists "Anyone can read live shared workouts" on public.shared_workouts;
create policy "Anyone can read live shared workouts"
  on public.shared_workouts for select
  to anon, authenticated
  using (revoked_at is null and (expires_at is null or expires_at > now()));

revoke select, update, delete, truncate on public.shared_workouts from anon, authenticated;
grant select (code, workout_data) on public.shared_workouts to anon, authenticated;

-- Nobody can claim another user's share, or set lineage, revocation or counters.
drop policy if exists "Anyone can insert shared workouts" on public.shared_workouts;
create policy "Anyone can insert shared workouts"
  on public.shared_workouts for insert
  to anon, authenticated
  with check (
    (user_id is null or user_id = auth.uid())
    and revoked_at is null
    and expires_at is null
    and parent_code is null
    and root_code is null
    and visibility = 'unlisted'
    and open_count = 0
    and import_count = 0
    and completion_count = 0
  );

-- ── Daily share limit ───────────────────────────────────────────────

create or replace function public.enforce_share_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  if new.user_id is not null then
    select count(*) into recent from shared_workouts
    where user_id = new.user_id and created_at > now() - interval '1 day';
  elsif new.anonymous_id is not null then
    select count(*) into recent from shared_workouts
    where anonymous_id = new.anonymous_id and created_at > now() - interval '1 day';
  else
    return new;
  end if;
  if recent >= 50 then
    raise exception 'share limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists shared_workouts_rate_limit on public.shared_workouts;
create trigger shared_workouts_rate_limit
  before insert on public.shared_workouts
  for each row execute function public.enforce_share_rate_limit();

-- ── Share events ────────────────────────────────────────────────────

create table if not exists public.share_events (
  id bigint generated always as identity primary key,
  share_code text not null,
  event_type text not null check (
    event_type in ('created', 'open', 'store_click', 'app_open', 'import', 'complete', 'reshare')
  ),
  anonymous_id text,
  user_id uuid,
  platform text,
  referrer text,
  created_at timestamptz not null default now()
);

create index if not exists share_events_code_idx on public.share_events (share_code, event_type);
create index if not exists share_events_created_idx on public.share_events (created_at);

-- Written only through the functions below.
alter table public.share_events enable row level security;
revoke all on public.share_events from anon, authenticated;

create or replace function public.log_share_event(
  p_code text,
  p_event text,
  p_anonymous_id text default null,
  p_platform text default null,
  p_referrer text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event not in ('open', 'store_click', 'app_open', 'import', 'complete') then
    return;
  end if;
  if not exists (select 1 from shared_workouts where code = p_code) then
    return;
  end if;
  insert into share_events (share_code, event_type, anonymous_id, user_id, platform, referrer)
  values (
    p_code,
    p_event,
    left(p_anonymous_id, 64),
    auth.uid(),
    left(p_platform, 16),
    left(p_referrer, 64)
  );
  update shared_workouts set
    open_count = open_count + (p_event = 'open')::int,
    import_count = import_count + (p_event = 'import')::int,
    completion_count = completion_count + (p_event = 'complete')::int
  where code = p_code;
end;
$$;

revoke all on function public.log_share_event(text, text, text, text, text) from public;
grant execute on function public.log_share_event(text, text, text, text, text) to anon, authenticated, service_role;

-- Older builds and the landing page call this.
create or replace function public.record_share_event(share_code text, event_kind text)
returns void
language sql
security definer
set search_path = public
as $$
  select public.log_share_event(share_code, event_kind);
$$;

revoke all on function public.record_share_event(text, text) from public;
grant execute on function public.record_share_event(text, text) to anon, authenticated, service_role;

-- ── Create, read, revoke ────────────────────────────────────────────

create or replace function public.create_share(
  p_code text,
  p_payload jsonb,
  p_kind text,
  p_workout_id text default null,
  p_workout_name text default null,
  p_image_path text default null,
  p_parent_code text default null,
  p_anonymous_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_code text;
  v_parent_root text;
begin
  if p_code !~ '^[A-Za-z0-9]{4,16}$' then
    raise exception 'invalid code' using errcode = '22023';
  end if;

  if p_parent_code is not null then
    select sw.code, sw.root_code into v_parent_code, v_parent_root
    from shared_workouts sw where sw.code = p_parent_code;
  end if;

  insert into shared_workouts (
    code, workout_data, user_id, anonymous_id, workout_id, workout_name, share_type,
    image_path, parent_code, root_code
  ) values (
    p_code,
    p_payload,
    auth.uid(),
    case when auth.uid() is null then left(p_anonymous_id, 64) end,
    left(p_workout_id, 64),
    left(p_workout_name, 120),
    p_kind,
    p_image_path,
    v_parent_code,
    coalesce(v_parent_root, v_parent_code)
  );

  insert into share_events (share_code, event_type, anonymous_id, user_id)
  values (p_code, 'created', left(p_anonymous_id, 64), auth.uid());
  if v_parent_code is not null then
    insert into share_events (share_code, event_type, anonymous_id, user_id)
    values (v_parent_code, 'reshare', left(p_anonymous_id, 64), auth.uid());
  end if;

  return p_code;
end;
$$;

revoke all on function public.create_share(text, jsonb, text, text, text, text, text, text) from public;
grant execute on function public.create_share(text, jsonb, text, text, text, text, text, text) to anon, authenticated;

-- One share by code. Revoked and expired shares come back with their status
-- and no content, so the landing page can say the link was removed.
create or replace function public.get_share(p_code text)
returns table(status text, workout_data jsonb, image_path text, share_type text)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when sw.revoked_at is not null then 'revoked'
      when sw.expires_at is not null and sw.expires_at <= now() then 'expired'
      else 'active'
    end as status,
    case when sw.revoked_at is null and (sw.expires_at is null or sw.expires_at > now())
      then sw.workout_data end as workout_data,
    case when sw.revoked_at is null and (sw.expires_at is null or sw.expires_at > now())
      then sw.image_path end as image_path,
    sw.share_type
  from shared_workouts sw
  where sw.code = p_code;
$$;

revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated, service_role;

create or replace function public.revoke_share(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  if auth.uid() is null then
    return false;
  end if;
  update shared_workouts set revoked_at = now()
  where code = p_code and user_id = auth.uid() and revoked_at is null;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.revoke_share(text) from public;
grant execute on function public.revoke_share(text) to authenticated;

create or replace function public.list_my_shares(p_limit int default 100)
returns table(
  code text,
  workout_name text,
  share_type text,
  created_at timestamptz,
  revoked_at timestamptz,
  opens int,
  imports int,
  completions int
)
language sql
stable
security definer
set search_path = public
as $$
  select sw.code, sw.workout_name, sw.share_type, sw.created_at, sw.revoked_at,
    sw.open_count, sw.import_count, sw.completion_count
  from shared_workouts sw
  where auth.uid() is not null and sw.user_id = auth.uid()
  order by sw.created_at desc
  limit least(greatest(p_limit, 1), 500);
$$;

revoke all on function public.list_my_shares(int) from public;
grant execute on function public.list_my_shares(int) to authenticated;

-- ── Admin funnel ────────────────────────────────────────────────────
-- Same definition as admin/supabase-rpcs.sql.

drop function if exists public.share_funnel(int);
create or replace function public.share_funnel(num_days int default 30)
returns table(
  share_type text,
  shares int,
  sharers int,
  with_image int,
  opens int,
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
