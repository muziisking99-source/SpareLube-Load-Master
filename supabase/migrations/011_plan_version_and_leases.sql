-- Optimistic concurrency for daily plans + short edit leases

alter table public.plans
  add column if not exists version integer not null default 1;

comment on column public.plans.version is 'Incremented on each successful save; clients reject stale upserts';

-- One active editor per plan date (TTL lease)
create table if not exists public.plan_leases (
  date text primary key,
  owner_id text not null,
  owner_label text not null default '',
  expires_at timestamptz not null
);

create index if not exists plan_leases_expires_at_idx on public.plan_leases (expires_at);

alter table public.plan_leases enable row level security;

drop policy if exists "shared_select" on public.plan_leases;
drop policy if exists "shared_insert" on public.plan_leases;
drop policy if exists "shared_update" on public.plan_leases;
drop policy if exists "shared_delete" on public.plan_leases;

create policy "shared_select" on public.plan_leases for select to anon, authenticated using (true);
create policy "shared_insert" on public.plan_leases for insert to anon, authenticated with check (true);
create policy "shared_update" on public.plan_leases for update to anon, authenticated using (true) with check (true);
create policy "shared_delete" on public.plan_leases for delete to anon, authenticated using (true);
