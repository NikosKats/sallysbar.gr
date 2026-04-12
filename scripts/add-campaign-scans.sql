-- Per-scan analytics for marketing campaigns
create table if not exists public.campaign_scans (
  id              bigserial primary key,
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  scanned_at      timestamptz not null default now(),
  country         text,
  region          text,
  city            text,
  timezone        text,
  lat             numeric,
  lon             numeric,
  device          text,
  browser         text,
  os              text,
  user_agent      text,
  referer         text,
  accept_language text,
  ip_hash         text
);

create index if not exists campaign_scans_camp_idx on public.campaign_scans (campaign_id, scanned_at desc);
create index if not exists campaign_scans_at_idx   on public.campaign_scans (scanned_at desc);
create index if not exists campaign_scans_country_idx on public.campaign_scans (country);
