create table if not exists public.user_dashboard_layouts (
  email text primary key,
  layout_order jsonb not null default '[]'::jsonb,
  locked_expanded_card text null,
  locked_expanded_cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_dashboard_layouts
add column if not exists locked_expanded_card text null;

alter table public.user_dashboard_layouts
add column if not exists locked_expanded_cards jsonb not null default '[]'::jsonb;

create index if not exists user_dashboard_layouts_updated_at_idx
  on public.user_dashboard_layouts (updated_at desc);

alter table public.user_dashboard_layouts enable row level security;

drop policy if exists "dashboard layouts own row select" on public.user_dashboard_layouts;
create policy "dashboard layouts own row select"
on public.user_dashboard_layouts
for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "dashboard layouts own row insert" on public.user_dashboard_layouts;
create policy "dashboard layouts own row insert"
on public.user_dashboard_layouts
for insert
to authenticated
with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "dashboard layouts own row update" on public.user_dashboard_layouts;
create policy "dashboard layouts own row update"
on public.user_dashboard_layouts
for update
to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
