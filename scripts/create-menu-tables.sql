-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Creates menu_categories and menu_items tables with RLS disabled for service role

create table if not exists public.menu_categories (
  id          bigint generated always as identity primary key,
  slug        text        not null unique,
  title_en    text        not null,
  title_el    text        not null default '',
  sort        integer     not null default 0,
  is_visible  boolean     not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.menu_items (
  id             bigint generated always as identity primary key,
  category_id    bigint      not null references public.menu_categories(id) on delete cascade,
  slug           text        not null,
  name_en        text        not null,
  name_el        text        not null default '',
  description_en text        not null default '',
  description_el text        not null default '',
  price_cents    integer     not null default 0,
  currency       text        not null default 'EUR',
  sort           integer     not null default 0,
  is_visible     boolean     not null default true,
  tags           text[]      not null default '{}',
  created_at     timestamptz not null default now()
);

-- Enable RLS
alter table public.menu_categories enable row level security;
alter table public.menu_items      enable row level security;

-- Public read access (menu is publicly visible)
create policy "public read categories" on public.menu_categories
  for select using (true);

create policy "public read items" on public.menu_items
  for select using (true);

-- Service role bypasses RLS automatically — no extra policies needed for writes
