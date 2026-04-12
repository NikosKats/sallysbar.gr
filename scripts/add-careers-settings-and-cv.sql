-- Notification + CV upload support for careers
create table if not exists public.careers_settings (
  id              int primary key default 1,
  notify_email    text,
  notify_enabled  boolean not null default true,
  updated_at      timestamptz not null default now(),
  constraint careers_settings_singleton check (id = 1)
);

insert into public.careers_settings (id) values (1)
on conflict (id) do nothing;

alter table public.job_applications
  add column if not exists cv_url text,
  add column if not exists cv_filename text;

-- Storage bucket for CVs. Create manually in Supabase dashboard:
--   Storage → new bucket → name: "careers" → public (so recruiters can view CVs via link).
-- Or via SQL (Supabase-specific):
-- insert into storage.buckets (id, name, public) values ('careers', 'careers', true)
-- on conflict (id) do nothing;
