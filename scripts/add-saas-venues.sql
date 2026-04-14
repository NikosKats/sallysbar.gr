-- Venues you've deployed as SaaS customers.
-- Lives on your "mothership" Supabase (Sally's) so you have one source of truth.
create table if not exists public.saas_venues (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  display_name  text not null,
  domain        text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  tier          text not null default 'starter',    -- starter | pro | signature
  status        text not null default 'prospect',   -- prospect | onboarding | live | paused | churned
  billing_model text not null default 'seasonal_annual', -- seasonal_annual | monthly | annual
  season_start  date,
  season_end    date,
  setup_fee_eur int,
  recurring_eur int,
  supabase_ref  text,                -- supabase project ref (e.g. "abcd1234")
  pages_project text,                -- cloudflare pages project name
  notes         text,
  deployed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists saas_venues_status_idx on public.saas_venues (status);
create index if not exists saas_venues_tier_idx   on public.saas_venues (tier);

alter table public.saas_venues enable row level security;
drop policy if exists "saas_venues super only" on public.saas_venues;
create policy "saas_venues super only" on public.saas_venues for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
