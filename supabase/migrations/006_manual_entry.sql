-- Manual invoice entry: collection customers + plan trip selection (before truck pairing)

alter table public.customers
  add column if not exists collection boolean not null default false;

alter table public.plans
  add column if not exists trip_ids jsonb not null default '[]'::jsonb;
