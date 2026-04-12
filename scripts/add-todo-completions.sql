-- Per-user task completions. One row per (user_id, todo_key) — awarding the
-- same todo twice is a no-op (unique index).
create table if not exists public.todo_completions (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  todo_key     text not null,
  points       integer not null default 0,
  status       text not null default 'auto',  -- 'auto' | 'honor_claimed' | 'approved' | 'revoked'
  claimed_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  unique (user_id, todo_key)
);

create index if not exists todo_completions_user_idx on public.todo_completions (user_id, claimed_at desc);
create index if not exists todo_completions_status_idx on public.todo_completions (status);
