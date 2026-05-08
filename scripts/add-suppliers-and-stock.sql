-- Suppliers + bar/inventory stock tables.
-- Run once in Supabase SQL editor.

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('bar','inventory')),
  name text not null,
  unit text not null default 'btl',
  current_qty numeric not null default 0,
  reorder_threshold numeric not null default 0,
  default_order_qty numeric not null default 0,
  unit_cost numeric not null default 0,
  supplier_id uuid references suppliers(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_stock_items_category on stock_items(category);
create index if not exists idx_stock_items_supplier on stock_items(supplier_id);

-- All access goes through the admin API (service role). Block direct anon/auth access.
alter table suppliers   enable row level security;
alter table stock_items enable row level security;

drop policy if exists "no client access" on suppliers;
drop policy if exists "no client access" on stock_items;
create policy "no client access" on suppliers   for all using (false) with check (false);
create policy "no client access" on stock_items for all using (false) with check (false);
