-- Claim/redeem tracking for physical wheel prizes (shots, drinks, discounts, jackpot).
-- Points rewards are auto-credited and don't need claims.
alter table public.wheel_spins
  add column if not exists claim_token text,
  add column if not exists claimed_at  timestamptz,
  add column if not exists claimed_by  uuid references auth.users(id),
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id),
  add column if not exists reject_reason text;

create unique index if not exists wheel_spins_claim_token_idx
  on public.wheel_spins (claim_token)
  where claim_token is not null;

create index if not exists wheel_spins_user_idx on public.wheel_spins (user_id, spun_at desc);
