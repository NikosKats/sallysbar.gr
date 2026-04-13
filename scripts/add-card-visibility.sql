-- Per-field card visibility.
alter table public.profiles
  add column if not exists card_visibility jsonb not null default '{
    "bio": true,
    "location": true,
    "phone": false,
    "avatar": true,
    "role_badge": true,
    "socials": {"instagram":true,"facebook":true,"tiktok":true,"x":true,"linkedin":true,"youtube":true,"website":true}
  }'::jsonb;
