-- Extended profile fields collected at loyalty card issuance
alter table public.profiles
  add column if not exists phone              text,
  add column if not exists country            text,
  add column if not exists gender             text,
  add column if not exists address            text,
  add column if not exists city               text,
  add column if not exists postal_code        text,
  add column if not exists marketing_consent  boolean default false,
  add column if not exists card_issued_at     timestamptz;
