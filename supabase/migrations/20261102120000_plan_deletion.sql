-- Plan deletion support.
--
-- 1. plan_generations: an append-only ledger of AI plans a user has created.
--    The free-tier quota counts this table instead of training_plans, so
--    deleting a plan never hands back a free generation.
-- 2. training_plans gains a 'deleted' status + deleted_at. Deleted plans are
--    recoverable for 30 days, then purged by a daily pg_cron job.

-- ── Plan generation ledger ──────────────────────────────────

create table if not exists plan_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  plan_id uuid references training_plans on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_generations_user on plan_generations (user_id);

alter table plan_generations enable row level security;
-- Read-only for users; rows are written exclusively by the trigger below.
create policy "Users can read own plan generations"
  on plan_generations for select using (auth.uid() = user_id);

-- AI plans are non-custom race plans, or custom-distance plans that carry an
-- outline. Bare 'custom' plans hold manually scheduled workouts and are free.
create or replace function record_plan_generation()
returns trigger as $$
begin
  if new.race_type <> 'custom'
     or (jsonb_typeof(new.outline) = 'array' and jsonb_array_length(new.outline) > 0) then
    insert into plan_generations (user_id, plan_id, created_at)
    values (new.user_id, new.id, new.created_at);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_record_plan_generation on training_plans;
create trigger trg_record_plan_generation
  after insert on training_plans
  for each row execute function record_plan_generation();

insert into plan_generations (user_id, plan_id, created_at)
select tp.user_id, tp.id, tp.created_at
from training_plans tp
where (tp.race_type <> 'custom'
       or (jsonb_typeof(tp.outline) = 'array' and jsonb_array_length(tp.outline) > 0))
  and not exists (select 1 from plan_generations g where g.plan_id = tp.id);

-- ── Soft delete ─────────────────────────────────────────────

alter table training_plans
  add column if not exists deleted_at timestamptz;

alter table training_plans drop constraint if exists training_plans_status_check;
alter table training_plans
  add constraint training_plans_status_check
  check (status in ('active', 'completed', 'archived', 'deleted'));

-- ── Purge after 30 days ─────────────────────────────────────
-- plan_workouts cascade; ai_conversations.plan_id and plan_generations.plan_id
-- are set null, so conversations and the quota ledger survive the purge.

create or replace function purge_deleted_training_plans()
returns int as $$
  with purged as (
    delete from training_plans
    where status = 'deleted'
      and deleted_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::int from purged;
$$ language sql security definer set search_path = public;

revoke execute on function purge_deleted_training_plans() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule(
  'purge-deleted-training-plans',
  '17 9 * * *',
  $$select public.purge_deleted_training_plans()$$
);
