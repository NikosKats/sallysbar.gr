-- Saved stock/order lists with public share tokens.
-- Run once in Supabase SQL editor.

create table if not exists stock_lists (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'mixed' check (scope in ('bar','inventory','mixed')),
  name text not null,
  share_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists stock_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references stock_lists(id) on delete cascade,
  stock_item_id uuid references stock_items(id) on delete set null,
  -- snapshot fields keep the list readable even if the source item is later renamed/deleted
  name text not null,
  unit text,
  subcategory text,
  unit_cost numeric not null default 0,
  qty numeric not null default 0,
  supplier_name text,
  position int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_stock_list_items_list on stock_list_items(list_id);

alter table stock_lists      enable row level security;
alter table stock_list_items enable row level security;
drop policy if exists "no client access" on stock_lists;
drop policy if exists "no client access" on stock_list_items;
create policy "no client access" on stock_lists      for all using (false) with check (false);
create policy "no client access" on stock_list_items for all using (false) with check (false);
