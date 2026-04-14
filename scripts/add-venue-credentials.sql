-- Extend saas_venues with per-install URLs and identifiers.
-- We deliberately DO NOT store secrets here (keys live in Cloudflare secrets / your password manager).
-- This table just maps slug → where the dashboards live.
alter table public.saas_venues
  add column if not exists supabase_url        text,   -- https://<ref>.supabase.co
  add column if not exists supabase_dashboard  text,   -- https://supabase.com/dashboard/project/<ref>
  add column if not exists cloudflare_pages_url text,  -- https://<project>.pages.dev
  add column if not exists cloudflare_dashboard text,  -- dashboard URL to their Pages project
  add column if not exists fb_app_id            text,  -- for Facebook login
  add column if not exists fb_dashboard         text,  -- https://developers.facebook.com/apps/<id>/
  add column if not exists admin_bootstrap_email text,
  add column if not exists github_repo          text,  -- https://github.com/owner/<slug>
  add column if not exists last_deploy_version  text,  -- short git SHA or tag
  add column if not exists last_health_check    timestamptz,
  add column if not exists last_health_ok       boolean;
