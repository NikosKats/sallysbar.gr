-- Anti-abuse for the signup scratch bonus: bind reveal to a unique phone number.
-- The card can still be *issued* immediately (good UX hook), but it can only be
-- *revealed* once per phone number, forever. Deleting + recreating the account
-- no longer grants a second reveal.

create extension if not exists pgcrypto;

alter table public.scratch_cards
  add column if not exists phone_hash text,
  add column if not exists ip_hash    text;

-- Hard lock: once a signup card has been revealed by a phone, that phone can
-- never reveal another signup card — across all users, forever.
create unique index if not exists scratch_signup_phone_revealed_once
  on public.scratch_cards (phone_hash)
  where trigger = 'signup' and revealed_at is not null and phone_hash is not null;

-- Audit log of blocked attempts (visible to admin).
create table if not exists public.signup_abuse_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid,
  email       text,
  phone_hash  text,
  ip_hash     text,
  reason      text not null,
  action      text not null   -- 'blocked' | 'flagged'
);
create index if not exists signup_abuse_phone_idx   on public.signup_abuse_log (phone_hash);
create index if not exists signup_abuse_ip_idx      on public.signup_abuse_log (ip_hash);
create index if not exists signup_abuse_created_idx on public.signup_abuse_log (created_at desc);
