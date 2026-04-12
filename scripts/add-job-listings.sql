-- Job listings managed from /admin/careers, rendered on /careers
create table if not exists public.job_listings (
  id               uuid primary key default gen_random_uuid(),
  title_en         text not null,
  title_el         text not null,
  department       text,
  employment_type  text,            -- full_time | part_time | seasonal | contract
  location         text default 'Skala, Kefalonia',
  description_en   text,
  description_el   text,
  requirements_en  text,
  requirements_el  text,
  salary_range     text,
  apply_email      text,
  active           boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_job_listings_active_sort
  on public.job_listings (active, sort_order, created_at desc);
