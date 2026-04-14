-- Master ON/OFF for each game (wheel / scratch / quests).
-- wheel_settings.enabled already exists.
alter table public.scratch_settings  add column if not exists enabled boolean not null default true;
alter table public.quest_settings    add column if not exists enabled boolean not null default true;
