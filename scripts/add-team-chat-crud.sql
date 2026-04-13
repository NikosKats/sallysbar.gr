-- Team chat: editable / deletable / attachments.
alter table public.team_messages
  add column if not exists edited_at  timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists image_url  text;

-- Storage bucket for chat uploads (images). Public read so the chat page can render directly.
insert into storage.buckets (id, name, public) values ('chat', 'chat', true)
  on conflict (id) do update set public = true;

-- Staff + admin may upload under their own user-id folder.
drop policy if exists "chat self write" on storage.objects;
create policy "chat self write" on storage.objects
  for all to authenticated
  using  (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat public read" on storage.objects;
create policy "chat public read" on storage.objects
  for select using (bucket_id = 'chat');
