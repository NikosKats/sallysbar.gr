-- Simple URL shortener. Populated by /api/admin/shorten-url and redirected by /s/[slug].
create table if not exists public.short_links (
  id            bigserial primary key,
  slug          text unique not null,                -- 5-char base36, e.g. "ab3fx"
  target_url    text not null,
  created_by    uuid references auth.users(id) on delete set null,
  hits          int  not null default 0,
  created_at    timestamptz not null default now(),
  last_hit_at   timestamptz
);
create index if not exists short_links_slug_idx on public.short_links (slug);

alter table public.short_links enable row level security;

-- Admins can see the whole table for analytics
drop policy if exists "short_links admin read" on public.short_links;
create policy "short_links admin read" on public.short_links for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));

-- Writes happen via service role only (through /api/admin/shorten-url)
-- Public redirect also uses service role (the /s/[slug] route reads target_url)
