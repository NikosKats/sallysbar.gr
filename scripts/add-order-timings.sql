-- Timestamp every order-lifecycle transition so we can measure durations.
-- created_at already exists and represents "placed".
alter table public.orders
  add column if not exists prepared_at  timestamptz,  -- pending → preparing (barman accepted)
  add column if not exists ready_at     timestamptz,  -- preparing → ready   (barman finished)
  add column if not exists delivered_at timestamptz,  -- ready → delivered   (waiter took to table)
  add column if not exists paid_at      timestamptz;  -- delivered → paid

create index if not exists orders_prepared_at_idx  on public.orders (prepared_at);
create index if not exists orders_ready_at_idx     on public.orders (ready_at);
create index if not exists orders_delivered_at_idx on public.orders (delivered_at);
create index if not exists orders_paid_at_idx      on public.orders (paid_at);
