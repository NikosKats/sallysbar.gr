-- Partners table — places that send guests to Sally's via the welcome flow.
-- Each partner has its own welcome page (/welcome/<slug>), code prefix, gift,
-- and (optionally) commission terms. Public-facing listing on /partners.

create table if not exists partners (
  slug                       text primary key,
  name                       text not null,
  short_description          text,
  long_description           text,
  website_url                text,
  google_business_url        text,
  google_maps_url            text,
  logo_url                   text,
  city                       text,
  distance_from_bar          text,
  gift_label                 text not null default 'free welcome drink',
  code_prefix                text not null default 'PRT',
  require_email_otp          boolean not null default true,
  require_phone_otp          boolean not null default true,
  allow_facebook_login       boolean not null default true,
  commission_per_redeem_eur  numeric(8,2) not null default 0,
  monthly_report_email       text,
  notes                      text,
  active                     boolean not null default true,
  visible_on_public_page     boolean not null default true,
  sort_order                 int not null default 100,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists partners_active_visible_idx
  on partners (visible_on_public_page, active, sort_order);

-- Seed Helen's (idempotent — uses the same gift label currently set on
-- welcome_settings, but doesn't depend on that table existing).
insert into partners (slug, name, short_description, city, gift_label, code_prefix, sort_order, website_url)
values (
  'helens',
  'Helen''s Studios & Apartments',
  'Family-run studios in the heart of Skala, 200m from Sally''s Bar.',
  'Skala, Kefalonia',
  'free welcome drink',
  'HEL',
  10,
  'https://www.booking.com/hotel/gr/helen-39-s-studios-amp-apartments.html'
)
on conflict (slug) do nothing;
