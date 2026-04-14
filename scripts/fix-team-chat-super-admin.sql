-- Allow super_admin to read/write team chat.
drop policy if exists "team read" on public.team_messages;
create policy "team read" on public.team_messages for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('employee','admin','super_admin')));

drop policy if exists "team write" on public.team_messages;
create policy "team write" on public.team_messages for insert
  with check (user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('employee','admin','super_admin')));
