-- Vonage Messages API webhooks: inbound replies + delivery status.
-- Called by Vonage when something happens to a message we sent, OR when a
-- user replies to our number on any channel (SMS / WhatsApp / Viber / etc.).

-- 1) Inbound messages — every reply we receive.
create table if not exists public.vonage_inbound_messages (
  id            bigserial primary key,
  message_uuid  text unique,                -- Vonage's UUID for this message
  channel       text not null,              -- sms | whatsapp | viber_service | messenger | instagram
  from_address  text not null,              -- customer's phone or platform-scoped ID
  to_address    text,                       -- our number / page ID
  message_type  text,                       -- text | image | audio | video | file | location | …
  text          text,                       -- message body (null if media-only)
  matched_user_id uuid references auth.users(id) on delete set null,
  handled       boolean not null default false,   -- admin can mark as "dealt with"
  raw           jsonb not null default '{}'::jsonb,
  received_at   timestamptz not null default now()
);
create index if not exists vim_from_channel_idx on public.vonage_inbound_messages (channel, from_address);
create index if not exists vim_received_idx     on public.vonage_inbound_messages (received_at desc);
create index if not exists vim_matched_idx      on public.vonage_inbound_messages (matched_user_id) where matched_user_id is not null;

alter table public.vonage_inbound_messages enable row level security;
drop policy if exists "vim admin read" on public.vonage_inbound_messages;
create policy "vim admin read" on public.vonage_inbound_messages for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));
drop policy if exists "vim admin update" on public.vonage_inbound_messages;
create policy "vim admin update" on public.vonage_inbound_messages for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));

-- 2) Delivery status — submitted/delivered/rejected/read per message we send.
create table if not exists public.vonage_message_status (
  id            bigserial primary key,
  message_uuid  text not null,
  channel       text not null,
  status        text not null,              -- submitted | delivered | rejected | undeliverable | read
  to_address    text,
  error_code    text,
  error_reason  text,
  price_eur     numeric,                    -- Vonage's reported price
  raw           jsonb not null default '{}'::jsonb,
  received_at   timestamptz not null default now()
);
create index if not exists vms_uuid_idx       on public.vonage_message_status (message_uuid);
create index if not exists vms_received_idx   on public.vonage_message_status (received_at desc);
create index if not exists vms_status_idx     on public.vonage_message_status (status);

alter table public.vonage_message_status enable row level security;
drop policy if exists "vms admin read" on public.vonage_message_status;
create policy "vms admin read" on public.vonage_message_status for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));

-- 3) Voice calls — inbound (and outbound) to our Vonage number.
create table if not exists public.vonage_voice_calls (
  id            bigserial primary key,
  call_uuid     text,
  conversation_uuid text,
  direction     text,                        -- inbound | outbound
  from_address  text,
  to_address    text,
  status        text not null,               -- started | ringing | answered | completed | busy | failed | rejected | timeout
  duration_sec  int,                         -- filled on completion
  price_eur     numeric,
  recording_url text,                        -- Vonage-hosted recording (if we recorded)
  matched_user_id uuid references auth.users(id) on delete set null,
  handled       boolean not null default false,
  raw           jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index if not exists vvc_uuid_idx     on public.vonage_voice_calls (call_uuid);
create index if not exists vvc_from_idx     on public.vonage_voice_calls (from_address);
create index if not exists vvc_started_idx  on public.vonage_voice_calls (started_at desc);

alter table public.vonage_voice_calls enable row level security;
drop policy if exists "vvc admin read" on public.vonage_voice_calls;
create policy "vvc admin read" on public.vonage_voice_calls for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));
drop policy if exists "vvc admin update" on public.vonage_voice_calls;
create policy "vvc admin update" on public.vonage_voice_calls for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));
