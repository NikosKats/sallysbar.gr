-- Add signup-bonus toggle to scratch_settings
alter table public.scratch_settings
  add column if not exists auto_on_signup boolean not null default false;

-- Idempotency: one signup-bonus per user, forever
create unique index if not exists scratch_signup_once_per_user
  on public.scratch_cards (user_id)
  where trigger = 'signup';
