-- Single-row toggles for /table/[id] features (admin-controlled).
create table if not exists public.table_page_settings (
  id int primary key default 1,
  menu_tile_enabled    boolean not null default true,
  wheel_tile_enabled   boolean not null default true,
  card_tile_enabled    boolean not null default true,
  call_order_enabled   boolean not null default true,
  call_pay_enabled     boolean not null default true,
  chatbot_enabled      boolean not null default true,
  updated_at           timestamptz not null default now(),
  constraint only_one_row check (id = 1)
);

insert into public.table_page_settings (id) values (1) on conflict (id) do nothing;

alter table public.table_page_settings enable row level security;

-- Everyone (incl. anonymous) may read the toggles (needed by /table/[id])
drop policy if exists "tps read" on public.table_page_settings;
create policy "tps read" on public.table_page_settings for select using (true);

-- Only admins may update
drop policy if exists "tps write" on public.table_page_settings;
create policy "tps write" on public.table_page_settings for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
