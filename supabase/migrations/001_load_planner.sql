-- Load Planner — Lovable Cloud / Supabase schema
-- Run this in Cloud → SQL editor (or apply as a migration).
-- Shared warehouse: anon + authenticated can read/write all tables.

-- Areas catalog
create table if not exists public.areas (
  name text primary key,
  created_at timestamptz not null default now()
);

-- Trucks
create table if not exists public.trucks (
  id text primary key,
  name text not null,
  max_weight numeric not null default 3000,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Customers (id = customerKey: code if present, else name)
create table if not exists public.customers (
  id text primary key,
  code text not null default '',
  name text not null,
  default_area text not null default '',
  loading_number integer not null default 0,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_name_idx on public.customers (name);
create index if not exists customers_code_idx on public.customers (code);

-- Daily plans (nested JSON for truckDay + invoices)
create table if not exists public.plans (
  date text primary key,
  areas jsonb not null default '[]'::jsonb,
  truck_day jsonb not null default '[]'::jsonb,
  invoices jsonb not null default '[]'::jsonb,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  step text not null default 'setup',
  updated_at timestamptz not null default now()
);

-- Audit log
create table if not exists public.audit_entries (
  id text primary key,
  ts timestamptz not null default now(),
  type text not null,
  message text not null,
  payload jsonb
);

create index if not exists audit_entries_ts_idx on public.audit_entries (ts desc);

-- App settings singleton
create table if not exists public.app_settings (
  id integer primary key check (id = 1),
  active_date text not null,
  admin_pin text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id, active_date, admin_pin)
values (1, to_char((now() + interval '1 day')::date, 'YYYY-MM-DD'), '')
on conflict (id) do nothing;

-- Row Level Security: shared warehouse floor access
alter table public.areas enable row level security;
alter table public.trucks enable row level security;
alter table public.customers enable row level security;
alter table public.plans enable row level security;
alter table public.audit_entries enable row level security;
alter table public.app_settings enable row level security;

-- Drop existing policies if re-running
do $$
declare
  t text;
begin
  foreach t in array array['areas','trucks','customers','plans','audit_entries','app_settings']
  loop
    execute format('drop policy if exists "shared_select" on public.%I', t);
    execute format('drop policy if exists "shared_insert" on public.%I', t);
    execute format('drop policy if exists "shared_update" on public.%I', t);
    execute format('drop policy if exists "shared_delete" on public.%I', t);
  end loop;
end $$;

create policy "shared_select" on public.areas for select to anon, authenticated using (true);
create policy "shared_insert" on public.areas for insert to anon, authenticated with check (true);
create policy "shared_update" on public.areas for update to anon, authenticated using (true) with check (true);
create policy "shared_delete" on public.areas for delete to anon, authenticated using (true);

create policy "shared_select" on public.trucks for select to anon, authenticated using (true);
create policy "shared_insert" on public.trucks for insert to anon, authenticated with check (true);
create policy "shared_update" on public.trucks for update to anon, authenticated using (true) with check (true);
create policy "shared_delete" on public.trucks for delete to anon, authenticated using (true);

create policy "shared_select" on public.customers for select to anon, authenticated using (true);
create policy "shared_insert" on public.customers for insert to anon, authenticated with check (true);
create policy "shared_update" on public.customers for update to anon, authenticated using (true) with check (true);
create policy "shared_delete" on public.customers for delete to anon, authenticated using (true);

create policy "shared_select" on public.plans for select to anon, authenticated using (true);
create policy "shared_insert" on public.plans for insert to anon, authenticated with check (true);
create policy "shared_update" on public.plans for update to anon, authenticated using (true) with check (true);
create policy "shared_delete" on public.plans for delete to anon, authenticated using (true);

create policy "shared_select" on public.audit_entries for select to anon, authenticated using (true);
create policy "shared_insert" on public.audit_entries for insert to anon, authenticated with check (true);
create policy "shared_update" on public.audit_entries for update to anon, authenticated using (true) with check (true);
create policy "shared_delete" on public.audit_entries for delete to anon, authenticated using (true);

create policy "shared_select" on public.app_settings for select to anon, authenticated using (true);
create policy "shared_insert" on public.app_settings for insert to anon, authenticated with check (true);
create policy "shared_update" on public.app_settings for update to anon, authenticated using (true) with check (true);
create policy "shared_delete" on public.app_settings for delete to anon, authenticated using (true);
