-- Admin-toggleable automated marketing campaigns + a log for dedup/analytics.
create table if not exists public.marketing_triggers (
  key        text primary key,
  enabled    boolean not null default true,
  channel    text not null default 'whatsapp',   -- whatsapp | sms | push | email
  settings   jsonb not null default '{}'::jsonb, -- per-trigger knobs (e.g. cooldown days, min_party, hour)
  updated_at timestamptz not null default now()
);

-- Seed the built-in triggers (idempotent — admin edits persist, re-run safe)
insert into public.marketing_triggers (key, enabled, channel, settings) values
  ('reservation_confirmed',     true, 'whatsapp', '{}'),
  ('reservation_reminder_2h',   true, 'whatsapp', '{"lead_minutes": 120}'),
  ('birthday',                  true, 'whatsapp', '{"send_hour": 11}'),
  ('review_nudge',              true, 'whatsapp', '{"delay_hours": 24, "cooldown_days": 60}'),
  ('inactive_30d',              true, 'whatsapp', '{"days": 30, "cooldown_days": 45}'),
  ('inactive_60d',              true, 'whatsapp', '{"days": 60, "cooldown_days": 60}'),
  ('inactive_90d',              true, 'whatsapp', '{"days": 90, "cooldown_days": 60}'),
  ('happy_hour_local',          true, 'push',     '{"send_hour": 18, "radius_km": 2}'),
  ('group_booking_bonus',       true, 'whatsapp', '{"min_party": 6}'),
  ('admin_weekly_digest',       true, 'email',    '{"send_day": 0, "send_hour": 9}')
on conflict (key) do nothing;

alter table public.marketing_triggers enable row level security;
drop policy if exists "mt public read"  on public.marketing_triggers;
create policy "mt public read"  on public.marketing_triggers for select using (true);
drop policy if exists "mt admin write" on public.marketing_triggers;
create policy "mt admin write" on public.marketing_triggers for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));

-- Every outbound message logged — used for dedup + analytics.
create table if not exists public.marketing_log (
  id          bigserial primary key,
  trigger_key text not null,
  user_id     uuid references auth.users(id) on delete set null,
  channel     text not null,
  to_address  text,                        -- phone / email (denormalised for audit even after account delete)
  preview     text,                        -- first 140 chars of message
  success     boolean not null,
  error_text  text,
  meta        jsonb not null default '{}'::jsonb,
  sent_at     timestamptz not null default now()
);
create index if not exists marketing_log_user_trigger_idx on public.marketing_log (user_id, trigger_key, sent_at desc);
create index if not exists marketing_log_sent_at_idx on public.marketing_log (sent_at desc);

alter table public.marketing_log enable row level security;
drop policy if exists "ml admin read" on public.marketing_log;
create policy "ml admin read" on public.marketing_log for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));
