-- Daily "Wheel of Luck" spins — one per user per day, only at the bar.
create table if not exists public.wheel_spins (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  spun_at        timestamptz not null default now(),
  table_number   integer,
  lat            numeric,
  lon            numeric,
  distance_m     numeric,         -- distance from bar at spin time
  reward_type    text not null,
  reward_value   numeric,
  reward_label   text not null,
  ip_hash        text
);

-- Idempotency: one spin per user per calendar day (Europe/Athens).
create unique index if not exists wheel_spins_once_per_day
  on public.wheel_spins (user_id, ((spun_at at time zone 'Europe/Athens')::date));

create index if not exists wheel_spins_user_idx on public.wheel_spins (user_id, spun_at desc);
