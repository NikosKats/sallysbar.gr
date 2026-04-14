-- Reply-to + pin for team chat.
alter table public.team_messages
  add column if not exists reply_to  uuid references public.team_messages(id) on delete set null,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references auth.users(id);

create index if not exists team_messages_reply_to_idx on public.team_messages (reply_to);
create index if not exists team_messages_pinned_idx  on public.team_messages (pinned_at desc) where pinned_at is not null;
