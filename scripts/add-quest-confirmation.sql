-- Staff-confirmation flow for quest claims.
alter table public.quest_claims
  add column if not exists status        text not null default 'approved',
  add column if not exists claim_token   text,
  add column if not exists expires_at    timestamptz,
  add column if not exists reviewed_by   uuid references auth.users(id),
  add column if not exists reviewed_at   timestamptz,
  add column if not exists reject_reason text,
  add column if not exists table_number  int;

create index if not exists quest_claims_pending_idx on public.quest_claims (status) where status = 'pending';
create unique index if not exists quest_claims_token_idx on public.quest_claims (claim_token) where claim_token is not null;

-- Settings (one row, like wheel/scratch).
create table if not exists public.quest_settings (
  id                   int primary key default 1,
  require_confirmation boolean not null default true,
  approval_window_min  int not null default 5,
  updated_at           timestamptz not null default now(),
  constraint only_one_quest_settings check (id = 1)
);
insert into public.quest_settings (id) values (1) on conflict (id) do nothing;

alter table public.quest_settings enable row level security;
drop policy if exists "qs read" on public.quest_settings;
create policy "qs read" on public.quest_settings for select using (true);
drop policy if exists "qs admin" on public.quest_settings;
create policy "qs admin" on public.quest_settings for update
  using  (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));

-- Realtime publication so the customer's QR view auto-flips when staff approves.
alter publication supabase_realtime add table public.quest_claims;
