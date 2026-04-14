-- Admin overrides for built-in task defs (title/desc/points).
-- Lets you rename or retune any task without a code change.
alter table public.task_settings
  add column if not exists custom_title_en  text,
  add column if not exists custom_title_el  text,
  add column if not exists custom_desc_en   text,
  add column if not exists custom_desc_el   text,
  add column if not exists custom_points    integer,
  add column if not exists updated_at       timestamptz not null default now();
