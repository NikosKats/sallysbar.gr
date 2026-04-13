-- Public vCard support: handle (unique username) for clean /u/<handle> URLs.
alter table public.profiles
  add column if not exists handle         text unique,
  add column if not exists card_public    boolean not null default true;

create index if not exists profiles_handle_idx on public.profiles (handle);

-- ─────────────────────────────────────────────────────────────────────────────
-- Run in the Supabase dashboard (Storage → New bucket):
--   name: "avatars"     public: YES     (or run the insert below via SQL)
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

-- Allow any logged-in user to upload/update/delete files under their own userId prefix.
drop policy if exists "avatars self write" on storage.objects;
create policy "avatars self write" on storage.objects
  for all to authenticated
  using  (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');
