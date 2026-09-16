-- Optional A–Z letter printed on truck load sheets
alter table public.trucks
  add column if not exists sheet_letter text;

comment on column public.trucks.sheet_letter is 'Optional single A–Z letter shown on printed load sheets';
