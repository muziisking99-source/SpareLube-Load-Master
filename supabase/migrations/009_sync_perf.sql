-- Sync performance: targeted indexes + audit prune RPC.
-- Phase 2 incremental sync uses updated_at indexes from 005_perf_indexes.sql.

create index if not exists audit_entries_ts_id_idx on public.audit_entries (ts desc, id);

create index if not exists customers_default_area_name_idx on public.customers (default_area, name);

create or replace function public.prune_audit_entries(keep_count int default 5000)
returns void
language sql
as $$
  delete from public.audit_entries
  where id not in (
    select id from public.audit_entries
    order by ts desc
    limit keep_count
  );
$$;
