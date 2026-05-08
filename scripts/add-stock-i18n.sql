-- Bilingual name columns (Greek + English) for stock data.
-- Run once in Supabase SQL editor.

alter table stock_items       add column if not exists name_en text;
alter table stock_items       add column if not exists name_el text;

alter table stock_categories  add column if not exists name_en text;
alter table stock_categories  add column if not exists name_el text;

alter table stock_list_items  add column if not exists name_en text;
alter table stock_list_items  add column if not exists name_el text;

-- Backfill: keep existing `name` as the EN value where missing so nothing renders blank.
update stock_items      set name_en = coalesce(name_en, name) where name_en is null;
update stock_categories set name_en = coalesce(name_en, name) where name_en is null;
update stock_list_items set name_en = coalesce(name_en, name) where name_en is null;
