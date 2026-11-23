-- ═══════════════════════════════════════════════════════════════
-- Free vs. Pro Lifetime Purchase
--
-- 1. Add purchase_type to subscriptions
-- 2. Create trial_tracking for 5-run premium trial
-- 3. Create weekly_analysis_usage for free-tier weekly allowance
-- 4. Create app_config for remote feature flags (grandfathering)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Subscriptions: add purchase_type ──────────────────────

alter table subscriptions
  add column if not exists purchase_type text
    not null default 'subscription'
    check (purchase_type in ('subscription', 'lifetime'));

-- ── 2. Trial tracking ────────────────────────────────────────

create table if not exists trial_tracking (
  user_id uuid primary key references auth.users on delete cascade,
  completed_run_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table trial_tracking enable row level security;

create policy "Users can read own trial tracking"
  on trial_tracking for select
  using (auth.uid() = user_id);

-- Users can insert their own row (upsert on first run)
create policy "Users can insert own trial tracking"
  on trial_tracking for insert
  with check (auth.uid() = user_id);

-- Users can update their own row (increment counter)
create policy "Users can update own trial tracking"
  on trial_tracking for update
  using (auth.uid() = user_id);

-- ── 3. Weekly analysis usage ─────────────────────────────────

create table if not exists weekly_analysis_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  run_id uuid,
  used_at timestamptz not null default now()
);

alter table weekly_analysis_usage enable row level security;

create policy "Users can read own weekly analysis usage"
  on weekly_analysis_usage for select
  using (auth.uid() = user_id);

create policy "Users can insert own weekly analysis usage"
  on weekly_analysis_usage for insert
  with check (auth.uid() = user_id);

-- Index for efficient weekly lookups
create index if not exists idx_weekly_analysis_user_used_at
  on weekly_analysis_usage (user_id, used_at desc);

-- ── 4. App config (remote feature flags) ─────────────────────

create table if not exists app_config (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

alter table app_config enable row level security;

-- All authenticated users can read config
create policy "Authenticated users can read app config"
  on app_config for select
  using (auth.role() = 'authenticated');

-- Seed the grandfather cutoff date (null = grandfathering disabled)
insert into app_config (key, value)
  values ('grandfather_cutoff_date', 'null'::jsonb)
  on conflict (key) do nothing;
