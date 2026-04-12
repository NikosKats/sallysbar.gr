-- =====================================================================
-- Run this ONCE in Supabase SQL Editor. Safe to re-run.
-- Covers every table + column + index + trigger the scratch system uses.
-- =====================================================================

-- 1. Scratch cards table -----------------------------------------------
create table if not exists public.scratch_cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  reward_type   text not null,
  reward_value  numeric,
  reward_label  text not null,
  trigger       text,
  revealed_at   timestamptz,
  claimed_at    timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists scratch_user_idx on public.scratch_cards (user_id, created_at desc);
create index if not exists scratch_unrevealed_idx on public.scratch_cards (user_id) where revealed_at is null;

-- 2. Quests + claims ---------------------------------------------------
create table if not exists public.quests (
  id              uuid primary key default gen_random_uuid(),
  title_en        text not null,
  title_el        text not null,
  description_en  text,
  description_el  text,
  reward_points   integer not null default 50,
  reward_label_en text,
  reward_label_el text,
  cta_url         text,
  active_date     date not null,
  active_from     time,
  active_to       time,
  push_at         timestamptz,
  push_sent_at    timestamptz,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
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

-- 3. Scratch settings (admin toggles) ----------------------------------
create table if not exists public.scratch_settings (
  id                         int primary key default 1,
  auto_on_order              boolean not null default false,
  order_min_cents            integer not null default 500,
  cards_per_order            integer not null default 1,
  auto_on_rsvp               boolean not null default false,
  auto_on_checkin            boolean not null default false,
  auto_on_referral           boolean not null default false,
  auto_on_signup             boolean not null default true,     -- ON by default so signup bonus works out-of-the-box
  daily_drop_enabled         boolean not null default false,
  daily_drop_hour            smallint not null default 21,
  birthday_enabled           boolean not null default false,
  default_expires_hours      integer,
  updated_at                 timestamptz not null default now(),
  constraint scratch_settings_singleton check (id = 1)
);

-- Make sure the singleton row exists AND auto_on_signup column is present.
alter table public.scratch_settings add column if not exists auto_on_signup boolean not null default true;
insert into public.scratch_settings (id, auto_on_signup) values (1, true) on conflict (id) do nothing;

-- 4. Idempotency constraints ------------------------------------------
create unique index if not exists scratch_checkin_once_per_day
  on public.scratch_cards (user_id, ((created_at at time zone 'Europe/Athens')::date))
  where trigger = 'checkin';

create unique index if not exists scratch_daily_once_per_day
  on public.scratch_cards (user_id, ((created_at at time zone 'Europe/Athens')::date))
  where trigger = 'daily-drop';

create unique index if not exists scratch_birthday_once_per_day
  on public.scratch_cards (user_id, ((created_at at time zone 'Europe/Athens')::date))
  where trigger = 'birthday';

create unique index if not exists scratch_signup_once_per_user
  on public.scratch_cards (user_id)
  where trigger = 'signup';

-- 5. Belt-and-braces DB trigger: issue a scratch card automatically ---
--    whenever a new profile is created, if auto_on_signup is on.
--    This guarantees the card lands even if the client-side claim call
--    fails or the user closes the tab before it fires.
create or replace function public.fn_issue_signup_scratch()
returns trigger language plpgsql security definer as $$
declare
  enabled   boolean;
  expires_h integer;
  exp_at    timestamptz;
  picked_typ text;
  picked_val numeric;
  picked_lbl text;
  total_w    integer;
  r numeric;
begin
  select auto_on_signup, default_expires_hours
    into enabled, expires_h
  from public.scratch_settings where id = 1;

  if not coalesce(enabled, false) then return new; end if;

  -- Idempotency: one signup card per user, forever.
  if exists (select 1 from public.scratch_cards where user_id = new.id and trigger = 'signup') then
    return new;
  end if;

  if expires_h is not null and expires_h > 0 then
    exp_at := now() + make_interval(hours => expires_h);
  else
    exp_at := null;
  end if;

  -- Weighted random draw (mirrors src/lib/scratch.ts)
  with pool_data(typ, val, lbl, w) as (values
    ('points',     10::numeric,  '+10 points',           40),
    ('points',     25::numeric,  '+25 points',           25),
    ('points',     50::numeric,  '+50 points',           12),
    ('points',     100::numeric, '+100 points',           6),
    ('free_shot',  1::numeric,   'Free shot 🥃',           8),
    ('discount',   10::numeric,  '10% off next round',    5),
    ('free_drink', 1::numeric,   'Free cocktail 🍸',       3),
    ('custom',     0::numeric,   'Skip-the-line pass',    1)
  ),
  with_cum as (
    select typ, val, lbl, sum(w) over (order by w desc rows between unbounded preceding and current row) as cum
    from pool_data
  ),
  totals as (select sum(w)::integer as s from pool_data)
  select typ, val, lbl into picked_typ, picked_val, picked_lbl
  from with_cum, totals
  where cum >= (random() * totals.s)
  order by cum asc
  limit 1;

  insert into public.scratch_cards (user_id, reward_type, reward_value, reward_label, trigger, expires_at)
  values (new.id, coalesce(picked_typ, 'points'), coalesce(picked_val, 10), coalesce(picked_lbl, '+10 points'), 'signup', exp_at);

  return new;
exception when others then
  -- Never block profile creation on scratch failures.
  return new;
end;
$$;

drop trigger if exists trg_issue_signup_scratch on public.profiles;
create trigger trg_issue_signup_scratch
after insert on public.profiles
for each row
execute function public.fn_issue_signup_scratch();
