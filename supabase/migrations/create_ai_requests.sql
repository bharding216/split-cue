-- AI coach request log (plan edits, plan chat, workout builder) for quality analysis.
-- Rows are written only by edge functions with the service role. What the runner did
-- with each response arrives as an `ai_request_outcome` event and is joined in
-- ai_request_outcomes.

create table if not exists public.ai_requests (
  id uuid primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users on delete cascade,
  function_name text not null,
  source text,
  input_method text,
  user_text text,
  request jsonb,
  response jsonb,
  status text not null check (status in ('ok', 'invalid', 'error')),
  error text,
  model text,
  attempts int not null default 0,
  validation_problems jsonb not null default '[]'::jsonb,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  app_version text,
  environment text
);

create index if not exists idx_ai_requests_created_at on public.ai_requests (created_at desc);
create index if not exists idx_ai_requests_user_id on public.ai_requests (user_id);
create index if not exists idx_events_ai_request_outcome
  on public.events ((metadata->>'request_id'))
  where event_name = 'ai_request_outcome';

alter table public.ai_requests enable row level security;
revoke all on table public.ai_requests from anon, authenticated;
grant select, insert, update, delete on table public.ai_requests to service_role;

-- One outcome per request. A runner can trigger several (save to library, then add to
-- the plan), so the strongest one wins.
create or replace view public.ai_request_outcomes
with (security_invoker = true) as
select
  r.*,
  o.outcome,
  o.outcome_detail,
  o.outcome_at
from public.ai_requests r
left join lateral (
  select
    e.metadata->>'outcome' as outcome,
    e.metadata as outcome_detail,
    e.created_at as outcome_at
  from public.events e
  where e.event_name = 'ai_request_outcome'
    and e.metadata->>'request_id' = r.id::text
  order by
    coalesce(array_position(
      array['applied', 'edited_and_applied', 'partially_applied', 'saved_to_library', 'discarded', 'retried', 'closed'],
      e.metadata->>'outcome'
    ), 99),
    e.created_at
  limit 1
) o on true;

revoke all on table public.ai_request_outcomes from anon, authenticated;
grant select on table public.ai_request_outcomes to service_role;

-- Free text is personal data: keep it 90 days, keep the numbers for trend analysis.
create or replace function public.redact_old_ai_requests()
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_requests
  set user_text = null, request = null, response = null
  where created_at < now() - interval '90 days'
    and (user_text is not null or request is not null or response is not null);
$$;

revoke all on function public.redact_old_ai_requests() from public, anon, authenticated;

select cron.schedule('redact-old-ai-requests', '23 9 * * *', 'select public.redact_old_ai_requests()');
