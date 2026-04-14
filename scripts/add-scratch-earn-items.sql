-- Editable "How to earn more scratch cards" list shown on /scratch.
create table if not exists public.scratch_earn_items (
  id         uuid primary key default gen_random_uuid(),
  emoji      text not null default '🎁',
  text_en    text not null,
  text_el    text not null,
  sort_order int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scratch_earn_items_sort_idx on public.scratch_earn_items (active, sort_order);

insert into public.scratch_earn_items (emoji, text_en, text_el, sort_order) values
  ('🎁', 'Sign up → 1 welcome card',             'Νέα εγγραφή → 1 δώρο card',           1),
  ('📱', 'Verify your phone → 1 card',           'Επαληθεύεις τηλέφωνο → 1 card',        2),
  ('🎂', 'On your birthday → 1 card',            'Στα γενέθλιά σου → 1 card',            3),
  ('🤝', 'Every friend you refer → 1 card',       'Κάθε φίλος που εγγράφεται → 1 card',   4),
  ('🎯', 'Complete Tonight''s Quest → surprise',  'Ολοκλήρωσε Tonight''s Quest → έκπληξη',5)
on conflict do nothing;

alter table public.scratch_earn_items enable row level security;

drop policy if exists "sei public read" on public.scratch_earn_items;
create policy "sei public read" on public.scratch_earn_items for select using (true);

drop policy if exists "sei admin write" on public.scratch_earn_items;
create policy "sei admin write" on public.scratch_earn_items for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));
