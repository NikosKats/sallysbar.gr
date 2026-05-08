-- Add a free-text subcategory tag to stock_items (e.g. Spirits, Beer, Wine).
-- Run once in Supabase SQL editor.

alter table stock_items add column if not exists subcategory text;
create index if not exists idx_stock_items_subcategory on stock_items(subcategory);
