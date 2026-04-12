-- Loyalty extensions: tiers, rewards, redemptions, bonus rules.
-- Run after add-loyalty-linkage.sql.

-- 1) Extend loyalty_settings with bonus mechanics
alter table loyalty_settings
  add column if not exists double_point_dows int[] not null default '{}',
  add column if not exists birthday_multiplier numeric not null default 2,
  add column if not exists referral_points int not null default 50,
  add column if not exists event_rsvp_points int not null default 20;

-- 2) profiles: birthday (for birthday-month bonus) + referred_by
alter table profiles
  add column if not exists birthday date,
  add column if not exists referred_by uuid references auth.users(id);

-- 3) Configurable tiers
create table if not exists loyalty_tiers (
  key text primary key,
  label_en text not null,
  label_el text not null,
  icon text not null default '',
  color text not null default '#94a3b8',
  threshold int not null default 0,
  perk_en text not null default '',
  perk_el text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

insert into loyalty_tiers (key, label_en, label_el, icon, color, threshold, perk_en, perk_el, sort_order) values
  ('bronze',   'Bronze',   'Χάλκινο',  '🥉', '#cd7f32', 0,    'Welcome aboard',                                 'Καλώς ήρθες',                                    0),
  ('silver',   'Silver',   'Ασημένιο', '🥈', '#94a3b8', 100,  'Free shot or soft drink on next visit',         'Δωρεάν shot ή αναψυκτικό στην επόμενη επίσκεψη', 1),
  ('gold',     'Gold',     'Χρυσό',    '🥇', '#f59e0b', 300,  '10% off every order + priority bookings',        '10% έκπτωση + προτεραιότητα κρατήσεων',          2),
  ('platinum', 'Platinum', 'Πλατινένιο','💎', '#e5e4e2', 750,  'Free signature cocktail monthly + reserved seat','Δωρεάν signature cocktail/μήνα + ρεζερβέ',       3),
  ('vip',      'VIP',      'VIP',       '👑', '#a855f7', 1500, 'Bring-a-friend free drink + birthday bottle',    'Ποτό για φίλο + μπουκάλι γενεθλίων',             4)
on conflict (key) do nothing;

-- 4) Reward catalog
create table if not exists loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_el text not null,
  description_en text not null default '',
  description_el text not null default '',
  cost int not null check (cost > 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into loyalty_rewards (name_en, name_el, description_en, description_el, cost, sort_order) values
  ('Free coffee / soft drink', 'Δωρεάν καφές / αναψυκτικό', 'Any coffee or soft drink on us.',       'Οποιοσδήποτε καφές ή αναψυκτικό.',       50,   1),
  ('Free beer or shot',        'Δωρεάν μπύρα ή shot',       'Draft beer or house shot.',              'Μπύρα βαρελιού ή σπιτικό shot.',         100,  2),
  ('Free signature cocktail',  'Δωρεάν signature cocktail', 'Pick any signature cocktail.',           'Επίλεξε signature cocktail.',            200,  3),
  ('€25 bar credit',           '€25 πίστωση',               'Apply €25 off your next tab.',           'Έκπτωση €25 στον επόμενο λογαριασμό.',   500,  4),
  ('Private table for 4',      'Ρεζερβέ τραπέζι 4 ατόμων',  'Weekend night reserved seating for 4.',  'Ρεζερβέ τραπέζι για 4 Παρ/Σαβ.',         1000, 5)
on conflict do nothing;

-- 5) Redemptions log
create table if not exists loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_id uuid not null references loyalty_rewards(id),
  cost int not null,
  code text not null unique,
  status text not null default 'pending' check (status in ('pending','used','cancelled')),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users(id)
);
create index if not exists loyalty_redemptions_user_idx on loyalty_redemptions(user_id);
create index if not exists loyalty_redemptions_code_idx on loyalty_redemptions(code);
