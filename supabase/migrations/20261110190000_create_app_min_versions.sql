-- Oldest store build each platform still supports. Builds below min_version
-- show a blocking "Update required" screen that links to the store.
-- No row for a platform means no build is blocked.
-- Raise min_version only after that build is live in the store.

create table if not exists public.app_min_versions (
  platform    text primary key check (platform in ('ios', 'android')),
  min_version text not null check (min_version ~ '^\d+\.\d+\.\d+$'),
  updated_at  timestamptz not null default now()
);

alter table public.app_min_versions enable row level security;
revoke all on table public.app_min_versions from anon, authenticated;
grant select on table public.app_min_versions to anon, authenticated;
grant select, insert, update, delete on table public.app_min_versions to service_role;

drop policy if exists "Anyone can read minimum versions" on public.app_min_versions;
create policy "Anyone can read minimum versions"
  on public.app_min_versions for select
  to anon, authenticated
  using (true);
