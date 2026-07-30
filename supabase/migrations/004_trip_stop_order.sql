-- Trip-scoped customer load order. Run in Lovable Cloud → SQL editor.

alter table public.trips
  add column if not exists stop_order jsonb not null default '{}'::jsonb;
