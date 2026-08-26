-- Day-scoped stop order overrides (Adjust step). Does not change Admin trip templates.

alter table public.plans
  add column if not exists day_stop_order jsonb not null default '{}'::jsonb;
