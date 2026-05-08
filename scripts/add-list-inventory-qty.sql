-- Inventory-quantity column on list items (the on-hand qty alongside the order qty).
-- Run once in Supabase SQL editor.

alter table stock_list_items
  add column if not exists inventory_qty numeric not null default 0;
