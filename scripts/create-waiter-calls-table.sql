-- Run in Supabase SQL Editor
create table if not exists public.waiter_calls (
  id         bigint generated always as identity primary key,
  table_num  integer     not null,
  called_at  timestamptz not null default now()
);

-- Index for fast rate-limit queries
create index if not exists waiter_calls_table_time on public.waiter_calls (table_num, called_at desc);

-- Auto-delete records older than 1 hour to keep table small
create or replace function public.delete_old_waiter_calls() returns void
  language sql security definer as $$
    delete from public.waiter_calls where called_at < now() - interval '1 hour';
$$;
