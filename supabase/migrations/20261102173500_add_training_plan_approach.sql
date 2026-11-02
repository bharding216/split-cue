-- Coach's high-level plan description, approved by the runner before the plan is saved.
-- phases: [{ start_week, end_week, name, focus }]
alter table training_plans
  add column if not exists approach text,
  add column if not exists phases jsonb;
