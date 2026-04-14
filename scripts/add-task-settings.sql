-- Per-task enable/disable toggles for the /account "Tasks" panel.
create table if not exists public.task_settings (
  task_key   text primary key,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.task_settings enable row level security;

drop policy if exists "task_settings public read" on public.task_settings;
create policy "task_settings public read" on public.task_settings for select using (true);

drop policy if exists "task_settings admin write" on public.task_settings;
create policy "task_settings admin write" on public.task_settings for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));
