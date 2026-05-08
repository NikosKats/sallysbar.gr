-- Enable Supabase Realtime broadcast on orders + table_sessions + waiter_calls
-- so the /staff page auto-updates when a new round lands, an order status
-- flips, or a table presses the call-waiter button.
-- Idempotent — safe to re-run.

do $$
begin
  begin execute 'alter publication supabase_realtime add table orders';         exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table table_sessions'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table waiter_calls';   exception when duplicate_object then null; end;
end$$;

alter table orders          replica identity full;
alter table table_sessions  replica identity full;
alter table waiter_calls    replica identity full;

-- Human-friendly sequential number per order. Keeps the UUID `id` as the
-- internal primary key, adds a `seq` bigint that starts at 1 and auto-
-- increments so staff can reference "order #1234" instead of "order #A1B2C3D4".
create sequence if not exists orders_seq_seq as bigint start with 1 increment by 1;

-- Add column if missing + default future rows from the sequence.
alter table orders
  add column if not exists seq bigint;
alter table orders
  alter column seq set default nextval('orders_seq_seq');

-- Backfill NULLs on existing rows (in creation order).
update orders
  set seq = nextval('orders_seq_seq')
  where seq is null;

-- Sync the sequence to current max(seq) so future orders continue correctly.
select setval('orders_seq_seq', coalesce((select max(seq) from orders), 0) + 1, false);

-- Optional: make it not null + unique now that backfill is done.
alter table orders alter column seq set not null;
create unique index if not exists orders_seq_unique on orders (seq);
