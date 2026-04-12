-- Run in Supabase SQL Editor.
-- Adds multi-menu support: Main / Drinks / Food / Brunch etc.
-- Each menu can be toggled active, optionally scoped to a time window (HH:MM).

create table if not exists public.menus (
  id          bigint generated always as identity primary key,
  slug        text        not null unique,
  name_en     text        not null,
  name_el     text        not null default '',
  is_active   boolean     not null default true,
  start_time  time,                  -- null = always on
  end_time    time,                  -- null = always on
  sort        integer     not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.menus enable row level security;

drop policy if exists "public read menus" on public.menus;
create policy "public read menus" on public.menus
  for select using (true);

-- Seed a default "Main" menu (id becomes 1 on a fresh DB).
insert into public.menus (slug, name_en, name_el, is_active, sort)
select 'main', 'Main Menu', 'Κυρίως Μενού', true, 0
where not exists (select 1 from public.menus where slug = 'main');

-- Add menu_id to menu_categories, default to the main menu.
alter table public.menu_categories
  add column if not exists menu_id bigint references public.menus(id) on delete cascade;

update public.menu_categories
   set menu_id = (select id from public.menus where slug = 'main' limit 1)
 where menu_id is null;

alter table public.menu_categories
  alter column menu_id set not null;

create index if not exists menu_categories_menu_id_idx on public.menu_categories(menu_id);
