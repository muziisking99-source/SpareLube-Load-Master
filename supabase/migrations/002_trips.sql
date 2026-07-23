-- Named trips (ordered towns). Run in Lovable Cloud → SQL editor.

create table if not exists public.trips (
  id text primary key,
  name text not null,
  towns jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.trips enable row level security;

drop policy if exists "shared_select" on public.trips;
drop policy if exists "shared_insert" on public.trips;
drop policy if exists "shared_update" on public.trips;
drop policy if exists "shared_delete" on public.trips;

create policy "shared_select" on public.trips for select to anon, authenticated using (true);
create policy "shared_insert" on public.trips for insert to anon, authenticated with check (true);
create policy "shared_update" on public.trips for update to anon, authenticated using (true) with check (true);
create policy "shared_delete" on public.trips for delete to anon, authenticated using (true);
