-- Marketing campaigns with trackable QR-code redirects
create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  description   text,
  target_url    text not null,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  active        boolean not null default true,
  scan_count    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists campaigns_slug_idx on public.campaigns (slug);
create index if not exists campaigns_active_idx on public.campaigns (active);

create or replace function public.increment_campaign_scan(p_id uuid)
returns void language sql as $$
  update public.campaigns set scan_count = scan_count + 1 where id = p_id;
$$;
