-- Heart rate readings saved to a runner's account, one row per run.
--
-- Summary metrics (average, max, per-interval) live in cloud_history.data and
-- always sync. The readings themselves sync only when the runner has opted in
-- (profiles.hr_cloud_consent), and are stored apart from cloud_history so the
-- regular history sync doesn't download them every time.
--
-- Readings are private training data: owner-only access, never read by admin
-- reporting functions, and hard-deleted as soon as the run is deleted.

create table if not exists public.workout_hr_samples (
  user_id          uuid not null references auth.users(id) on delete cascade,
  history_id       text not null,
  encoding_version smallint not null,
  sample_count     int not null check (sample_count between 0 and 86400),
  samples          jsonb not null check (octet_length(samples::text) < 2000000),
  created_at       timestamptz not null default now(),
  primary key (user_id, history_id),
  foreign key (user_id, history_id)
    references public.cloud_history(user_id, history_id) on delete cascade
);

alter table public.workout_hr_samples enable row level security;

drop policy if exists "Users read their heart rate samples" on public.workout_hr_samples;
create policy "Users read their heart rate samples"
  on public.workout_hr_samples for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users delete their heart rate samples" on public.workout_hr_samples;
create policy "Users delete their heart rate samples"
  on public.workout_hr_samples for delete to authenticated
  using (auth.uid() = user_id);

-- Only for runs that still exist, so a deleted run's readings can't come back.
drop policy if exists "Users save heart rate samples for their runs" on public.workout_hr_samples;
create policy "Users save heart rate samples for their runs"
  on public.workout_hr_samples for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.cloud_history ch
      where ch.user_id = workout_hr_samples.user_id
        and ch.history_id = workout_hr_samples.history_id
        and ch.deleted_at is null
    )
  );

revoke all on public.workout_hr_samples from public, anon;
grant select, insert, delete on public.workout_hr_samples to authenticated;

-- ── Delete readings as soon as their run is deleted ──────────────────
-- Runs are soft-deleted so the deletion syncs to other devices.

create or replace function public.delete_hr_samples_for_deleted_run()
returns trigger as $$
begin
  delete from public.workout_hr_samples
  where user_id = new.user_id and history_id = new.history_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.delete_hr_samples_for_deleted_run() from public, anon, authenticated;

drop trigger if exists cloud_history_deleted_hr_samples on public.cloud_history;
create trigger cloud_history_deleted_hr_samples
  after update of deleted_at on public.cloud_history
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.delete_hr_samples_for_deleted_run();

-- ── Consent to save readings to the account ──────────────────────────
-- Null means the runner hasn't been asked yet.

alter table public.profiles
  add column if not exists hr_cloud_consent boolean,
  add column if not exists hr_cloud_consent_at timestamptz;

-- ── Purge deleted runs after 30 days ─────────────────────────────────
-- The run's data is erased but an empty tombstone row stays, so a device
-- that hasn't synced in a while still learns the run was deleted instead of
-- uploading it again.

create or replace function public.purge_deleted_cloud_history()
returns int as $$
  with purged as (
    update public.cloud_history
    set data = '{}'::jsonb
    where deleted_at < now() - interval '30 days'
      and data <> '{}'::jsonb
    returning 1
  )
  select count(*)::int from purged;
$$ language sql security definer set search_path = public;

revoke execute on function public.purge_deleted_cloud_history() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule(
  'purge-deleted-cloud-history',
  '27 9 * * *',
  $$select public.purge_deleted_cloud_history()$$
);
