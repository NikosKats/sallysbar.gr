-- Lightweight page-view log for sales metrics.
-- Fire-and-forget from /table/[id] and /u/[handle]. Keep 90 days.
create table if not exists public.page_events (
  id         bigserial primary key,
  kind       text not null,             -- 'table_scan' | 'card_view' | 'menu_view'
  ref_id     text,                       -- table number, handle, etc.
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists page_events_kind_at_idx on public.page_events (kind, created_at desc);
create index if not exists page_events_at_idx      on public.page_events (created_at desc);

-- Anon inserts are fine (it's opaque).
alter table public.page_events enable row level security;
drop policy if exists "pe insert any" on public.page_events;
create policy "pe insert any" on public.page_events for insert to public with check (true);
drop policy if exists "pe read admin" on public.page_events;
create policy "pe read admin" on public.page_events for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Add acknowledged_at so we can measure waiter response time.
alter table public.waiter_calls
  add column if not exists acknowledged_at timestamptz;
