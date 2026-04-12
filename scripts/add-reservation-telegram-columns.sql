-- Adds Telegram tracking columns to reservations.
-- Run once against the Supabase project.

alter table reservations
  add column if not exists telegram_message_id bigint,
  add column if not exists staff_note text,
  add column if not exists decided_at timestamptz;

-- Ensure status accepts the new values (no-op if column is free-text).
-- If you use a check constraint, adjust here:
-- alter table reservations drop constraint if exists reservations_status_check;
-- alter table reservations add constraint reservations_status_check
--   check (status in ('pending','confirmed','rejected','cancelled'));
