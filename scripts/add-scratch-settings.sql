-- Admin-controlled toggles for all 5 scratch-card auto-issue hooks
create table if not exists public.scratch_settings (
  id                         int primary key default 1,
  auto_on_order              boolean not null default false,
  order_min_cents            integer not null default 500,   -- €5.00 minimum spend to trigger a card
  cards_per_order            integer not null default 1,     -- how many cards per qualifying order
  auto_on_rsvp               boolean not null default false,
  auto_on_checkin            boolean not null default false,
  auto_on_referral           boolean not null default false,
  daily_drop_enabled         boolean not null default false,
  daily_drop_hour            smallint not null default 21,   -- 0..23, local to bar
  birthday_enabled           boolean not null default false,
  default_expires_hours      integer,                        -- null = no auto-expiry
  updated_at                 timestamptz not null default now(),
  constraint scratch_settings_singleton check (id = 1)
);

insert into public.scratch_settings (id) values (1) on conflict (id) do nothing;

-- Idempotency: scan-trigger (check-in) already fired today for a user
create unique index if not exists scratch_checkin_once_per_day
  on public.scratch_cards (user_id, ((created_at at time zone 'Europe/Athens')::date))
  where trigger = 'checkin';

-- Idempotency: daily drop fired already today
create unique index if not exists scratch_daily_once_per_day
  on public.scratch_cards (user_id, ((created_at at time zone 'Europe/Athens')::date))
  where trigger = 'daily-drop';

-- Idempotency: birthday drop fired already today
create unique index if not exists scratch_birthday_once_per_day
  on public.scratch_cards (user_id, ((created_at at time zone 'Europe/Athens')::date))
  where trigger = 'birthday';
