-- Performance indexes for town lookups and incremental sync.
-- Run in Lovable Cloud → SQL editor if migrations are not auto-applied.

create index if not exists customers_default_area_idx on public.customers (default_area);
create index if not exists trucks_updated_at_idx on public.trucks (updated_at desc);
create index if not exists trips_updated_at_idx on public.trips (updated_at desc);
create index if not exists customers_updated_at_idx on public.customers (updated_at desc);
create index if not exists plans_updated_at_idx on public.plans (updated_at desc);
