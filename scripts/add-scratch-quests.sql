-- Scratch-to-reveal cards
create table if not exists public.scratch_cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  reward_type   text not null,          -- points | free_shot | free_drink | discount | merch | custom
  reward_value  numeric,                -- points amount OR % discount depending on type
  reward_label  text not null,          -- human label, e.g. "50 pts", "Free shot"
  trigger       text,                   -- how it was issued: order | admin | visit | event
  revealed_at   timestamptz,
  claimed_at    timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists scratch_user_idx on public.scratch_cards (user_id, created_at desc);
create index if not exists scratch_unrevealed_idx on public.scratch_cards (user_id) where revealed_at is null;

-- Tonight's Quest
create table if not exists public.quests (
  id            uuid primary key default gen_random_uuid(),
  title_en      text not null,
  title_el      text not null,
  description_en text,
  description_el text,
  reward_points integer not null default 50,
  reward_label_en text,
  reward_label_el text,
  cta_url       text,                   -- optional deep link e.g. /book or /menu
  active_date   date not null,          -- quest runs on this date
  active_from   time,                   -- optional time window
  active_to     time,
  push_at       timestamptz,            -- when to push (null = not scheduled)
  push_sent_at  timestamptz,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists quests_active_date_idx on public.quests (active_date);

create table if not exists public.quest_claims (
  id         bigserial primary key,
  quest_id   uuid not null references public.quests(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  unique (quest_id, user_id)
);
create index if not exists quest_claims_user_idx on public.quest_claims (user_id);
