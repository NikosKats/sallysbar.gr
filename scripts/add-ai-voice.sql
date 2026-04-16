-- AI voice agent (Vapi) integration.
-- Adds source + ai_call_uuid to reservations so bookings taken by the AI
-- agent can be flagged as pending_ai and traced back to the originating call.
-- Extends vonage_voice_calls with transcript/summary/ai_handled so the inbox
-- can show the conversation from calls that were handled by Vapi.

alter table public.reservations
  add column if not exists source         text not null default 'web',
  add column if not exists ai_call_uuid   text;

-- 'pending_ai' is just a string value, no enum to update; if a check constraint
-- exists we loosen it to include the new status.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name   = 'reservations'
      and constraint_type = 'CHECK'
      and constraint_name ilike '%status%'
  ) then
    execute (
      select 'alter table public.reservations drop constraint ' || quote_ident(constraint_name)
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name   = 'reservations'
        and constraint_type = 'CHECK'
        and constraint_name ilike '%status%'
      limit 1
    );
  end if;
exception when others then null;
end $$;

create index if not exists reservations_source_idx        on public.reservations (source);
create index if not exists reservations_status_date_idx   on public.reservations (status, date);
create index if not exists reservations_ai_call_uuid_idx  on public.reservations (ai_call_uuid) where ai_call_uuid is not null;

-- Voice call transcripts + summaries from the AI agent.
alter table public.vonage_voice_calls
  add column if not exists ai_handled   boolean not null default false,
  add column if not exists transcript   text,
  add column if not exists summary      text,
  add column if not exists vapi_call_id text;

create index if not exists vonage_voice_calls_vapi_idx on public.vonage_voice_calls (vapi_call_id) where vapi_call_id is not null;
