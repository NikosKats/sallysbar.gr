-- Track last birthday change to prevent reward exploits
alter table public.profiles
  add column if not exists birthday_updated_at timestamptz;
