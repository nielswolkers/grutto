create table public.starred_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  link text not null,
  venue text,
  authors text[],
  published_date date,
  source text not null default 'scholar',
  citation text,
  favicon text,
  created_at timestamptz not null default now(),
  unique (user_id, link)
);

grant select, insert, delete on public.starred_sources to authenticated;
grant all on public.starred_sources to service_role;

alter table public.starred_sources enable row level security;

create policy "starred_sources_select_own"
  on public.starred_sources for select to authenticated
  using (auth.uid() = user_id);

create policy "starred_sources_insert_own"
  on public.starred_sources for insert to authenticated
  with check (auth.uid() = user_id);

create policy "starred_sources_delete_own"
  on public.starred_sources for delete to authenticated
  using (auth.uid() = user_id);

create index starred_sources_user_idx on public.starred_sources(user_id, created_at desc);