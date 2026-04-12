-- Loyalty linkage migration.
-- Run once against the Supabase project.

-- Link customer to their table session + orders.
alter table table_sessions
  add column if not exists customer_user_id uuid references auth.users(id);

alter table orders
  add column if not exists customer_user_id uuid references auth.users(id);

create index if not exists table_sessions_customer_user_id_idx on table_sessions(customer_user_id);
create index if not exists orders_customer_user_id_idx on orders(customer_user_id);

-- Single-row settings for loyalty rules.
create table if not exists loyalty_settings (
  id int primary key default 1,
  points_per_euro numeric not null default 1,
  min_order_cents int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint loyalty_settings_single_row check (id = 1)
);

insert into loyalty_settings (id) values (1)
on conflict (id) do nothing;

-- Prevent double-award per order.
create unique index if not exists loyalty_events_order_unique
  on loyalty_events(user_id, reason)
  where reason like 'order:%';
