-- Extra profile fields for the universal /settings page.
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists bio        text,
  add column if not exists socials    jsonb not null default '{}'::jsonb;

-- Each user can read + update their own profile (RLS).
drop policy if exists "profiles self read"   on public.profiles;
create policy "profiles self read"   on public.profiles for select using (id = auth.uid());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
