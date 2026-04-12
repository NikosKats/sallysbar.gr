create table if not exists public.job_applications (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references public.job_listings(id) on delete set null,
  full_name   text not null,
  email       text not null,
  phone       text,
  message     text,
  status      text not null default 'new',   -- new | reviewing | interview | rejected | hired
  created_at  timestamptz not null default now()
);

create index if not exists idx_job_applications_created
  on public.job_applications (created_at desc);
