-- Admin-controlled settings for the Daily Wheel of Luck.
create table if not exists public.wheel_settings (
  id                int primary key default 1,
  enabled           boolean not null default true,
  max_distance_m    integer not null default 250,
  require_country   boolean not null default false,   -- when true, reject non-GR cf-ipcountry
  updated_at        timestamptz not null default now(),
  constraint wheel_settings_singleton check (id = 1)
);

insert into public.wheel_settings (id) values (1) on conflict (id) do nothing;
