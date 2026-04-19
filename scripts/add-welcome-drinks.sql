-- Welcome drinks: one redeemable drink per signup, driven by a short code.
-- Source lets us fan this out to other hotels later (Helen's → 'helens').

create table if not exists welcome_drinks (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                          -- e.g. HEL-A4K9
  source       text not null,                                  -- 'helens'
  user_id      uuid references auth.users(id) on delete set null,
  full_name    text not null,
  email        text not null,
  phone        text not null,
  status       text not null default 'issued'
    check (status in ('issued','redeemed','expired')),
  issued_at    timestamptz not null default now(),
  redeemed_at  timestamptz,
  redeemed_by  uuid references auth.users(id) on delete set null,
  notes        text
);

-- One active welcome drink per email+source (prevents farming multiple drinks).
create unique index if not exists welcome_drinks_email_source_active_unique
  on welcome_drinks (lower(email), source)
  where status in ('issued','redeemed');

create index if not exists welcome_drinks_status_idx on welcome_drinks(status);
create index if not exists welcome_drinks_source_idx on welcome_drinks(source);
create index if not exists welcome_drinks_code_idx   on welcome_drinks(code);
