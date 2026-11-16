-- Add latest_version so the app can distinguish three tiers:
--   below min_version  → mandatory update (blocked)
--   below latest_version but >= min_version → optional update (suggested)
--   at latest_version  → current, no prompt

alter table public.app_min_versions
  add column latest_version text check (latest_version ~ '^\d+\.\d+\.\d+$');
