-- Editable scratch-card prize pool.
create table if not exists public.scratch_rewards (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('points','free_shot','free_drink','discount','custom')),
  value      integer not null default 0,
  label_en   text not null,
  label_el   text not null,
  weight     integer not null check (weight >= 0),
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scratch_rewards_active_idx on public.scratch_rewards (active, sort_order);

-- Seed with the current hardcoded pool on first run.
insert into public.scratch_rewards (type, value, label_en, label_el, weight, sort_order) values
  ('points',     10,  '+10 points',         '+10 πόντοι',             40, 1),
  ('points',     25,  '+25 points',         '+25 πόντοι',             25, 2),
  ('points',     50,  '+50 points',         '+50 πόντοι',             12, 3),
  ('points',     100, '+100 points',        '+100 πόντοι',             6, 4),
  ('free_shot',  1,   'Free shot 🥃',       'Δωρεάν σφηνάκι 🥃',        8, 5),
  ('discount',   10,  '10% off next round', '10% στην επόμενη γύρα',    5, 6),
  ('free_drink', 1,   'Free cocktail 🍸',    'Δωρεάν cocktail 🍸',       3, 7),
  ('custom',     0,   'Skip-the-line pass', 'Pass χωρίς ουρά',          1, 8)
on conflict do nothing;

alter table public.scratch_rewards enable row level security;

drop policy if exists "sr public read" on public.scratch_rewards;
create policy "sr public read" on public.scratch_rewards for select using (true);

drop policy if exists "sr admin write" on public.scratch_rewards;
create policy "sr admin write" on public.scratch_rewards for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));
