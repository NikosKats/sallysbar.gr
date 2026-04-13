-- Team chat: single shared room for all staff + admin.
create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists team_messages_created_at_idx on public.team_messages (created_at desc);

create table if not exists public.team_reads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.team_messages enable row level security;
alter table public.team_reads    enable row level security;

-- Only staff + admin may see / write messages.
drop policy if exists "team read" on public.team_messages;
create policy "team read" on public.team_messages for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('employee','admin')));

drop policy if exists "team write" on public.team_messages;
create policy "team write" on public.team_messages for insert
  with check (user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('employee','admin')));

drop policy if exists "team reads own" on public.team_reads;
create policy "team reads own" on public.team_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Add to realtime publication
alter publication supabase_realtime add table public.team_messages;
