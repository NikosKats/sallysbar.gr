-- Social linking: capture per-user Messenger PSID + Instagram-scoped ID so we
-- can send bulk campaigns on those channels. Populated via webhook at
-- /api/social/meta-webhook when a user taps a m.me/ig.me ref link on /account.

alter table public.profiles
  add column if not exists messenger_id     text,
  add column if not exists instagram_id     text,
  add column if not exists social_opt_in_at timestamptz;

create index if not exists profiles_messenger_idx on public.profiles(messenger_id) where messenger_id is not null;
create index if not exists profiles_instagram_idx on public.profiles(instagram_id) where instagram_id is not null;

-- Raw event log (debugging + analytics + audit trail)
create table if not exists public.social_webhook_events (
  id          bigserial primary key,
  platform    text not null,                  -- "messenger" | "instagram"
  event_type  text not null,                  -- "messaging_referral" | "messages" | ...
  sender_id   text,                           -- PSID or IG-scoped
  ref         text,                           -- "user_<uuid>" from our ref link
  matched_user_id uuid references auth.users(id) on delete set null,
  raw         jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists social_webhook_events_sender_idx on public.social_webhook_events (platform, sender_id);
create index if not exists social_webhook_events_created_idx on public.social_webhook_events (created_at desc);

alter table public.social_webhook_events enable row level security;
drop policy if exists "swe admin read" on public.social_webhook_events;
create policy "swe admin read" on public.social_webhook_events for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));
