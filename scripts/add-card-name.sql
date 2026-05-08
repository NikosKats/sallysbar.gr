-- Separate display name for the shareable /u/[handle] card.
-- If NULL, the card falls back to profiles.full_name.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS card_name text;

COMMENT ON COLUMN public.profiles.card_name IS
  'Optional display name for the public social card at /u/[handle]. Falls back to full_name when NULL.';
