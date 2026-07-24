-- Held invoices pool on app_settings (warehouse-scoped, across days).
-- Run in Lovable Cloud → SQL editor if needed.

alter table public.app_settings
  add column if not exists held_invoices jsonb not null default '[]'::jsonb;
