-- Managed categories for bar-stock / inventory.
-- Run once in Supabase SQL editor.

create table if not exists stock_categories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('bar','inventory')),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Case-insensitive uniqueness within a scope (so "Spirits" and "spirits" don't both exist).
create unique index if not exists idx_stock_categories_scope_name
  on stock_categories(scope, lower(name));

alter table stock_categories enable row level security;
drop policy if exists "no client access" on stock_categories;
create policy "no client access" on stock_categories for all using (false) with check (false);

-- Seed from any existing free-text subcategories already in stock_items so nothing is lost.
insert into stock_categories (scope, name)
select distinct si.category, trim(si.subcategory)
from stock_items si
where si.subcategory is not null
  and trim(si.subcategory) <> ''
  and not exists (
    select 1 from stock_categories sc
    where sc.scope = si.category and lower(sc.name) = lower(trim(si.subcategory))
  );
