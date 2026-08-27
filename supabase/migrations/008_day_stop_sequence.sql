-- Day-scoped drag stop sequence (Adjust). Does not renumber Load # or Admin templates.

alter table public.plans
  add column if not exists day_stop_sequence jsonb not null default '{}'::jsonb;
