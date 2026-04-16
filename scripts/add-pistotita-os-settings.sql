-- Public-visibility toggles for the PistotitaOS sales pages + footer link.
-- Super admin uses /admin/pistotita-os-settings to flip these.
create table if not exists public.pistotita_os_settings (
  id                    smallint primary key default 1,
  page_enabled          boolean not null default true,   -- /pistotita-os
  compare_page_enabled  boolean not null default true,   -- /pistotita-os/compare
  footer_link_enabled   boolean not null default true,   -- footer nav entry
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id) on delete set null,
  constraint pistotita_os_settings_singleton check (id = 1)
);

insert into public.pistotita_os_settings (id) values (1) on conflict (id) do nothing;

alter table public.pistotita_os_settings enable row level security;

drop policy if exists "pistotita_os_settings public read" on public.pistotita_os_settings;
create policy "pistotita_os_settings public read" on public.pistotita_os_settings
  for select using (true);

-- Writes happen via service role only (via /api/admin/pistotita-os-settings).
