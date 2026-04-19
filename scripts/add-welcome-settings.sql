-- Single-row settings for the Helen's welcome-drink flow. Toggles which OTP
-- channels are required + what gift phrase is shown to guests and staff.

create table if not exists welcome_settings (
  id                 int primary key default 1,
  require_email_otp  boolean not null default true,
  require_phone_otp  boolean not null default true,
  gift_label         text    not null default 'free welcome drink',
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null,
  constraint welcome_settings_single_row check (id = 1)
);

-- Additive column for existing installs (idempotent).
alter table welcome_settings
  add column if not exists gift_label text not null default 'free welcome drink';

insert into welcome_settings (id) values (1)
on conflict (id) do nothing;
