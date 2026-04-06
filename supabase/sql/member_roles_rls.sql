create table if not exists public.member_roles (
  email text primary key,
  app_role text not null check (app_role in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl', 'standard')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists member_roles_set_updated_at on public.member_roles;

create trigger member_roles_set_updated_at
before update on public.member_roles
for each row
execute function public.set_updated_at();

create or replace function public.current_member_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select mr.app_role
  from public.member_roles mr
  where lower(mr.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

alter table public.member_roles enable row level security;
alter table public.roster enable row level security;

drop policy if exists "member_roles_select_own_or_manager" on public.member_roles;
create policy "member_roles_select_own_or_manager"
on public.member_roles
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership')
);

drop policy if exists "member_roles_insert_self_or_manager" on public.member_roles;
create policy "member_roles_insert_self_or_manager"
on public.member_roles
for insert
to authenticated
with check (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership')
);

drop policy if exists "member_roles_update_manager_only" on public.member_roles;
create policy "member_roles_update_manager_only"
on public.member_roles
for update
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership')
);

drop policy if exists "roster_select_authenticated" on public.roster;
create policy "roster_select_authenticated"
on public.roster
for select
to authenticated
using (true);

drop policy if exists "roster_insert_role_managers" on public.roster;
create policy "roster_insert_role_managers"
on public.roster
for insert
to authenticated
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
);

drop policy if exists "roster_update_role_managers" on public.roster;
create policy "roster_update_role_managers"
on public.roster
for update
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
);

drop policy if exists "roster_delete_role_managers" on public.roster;
create policy "roster_delete_role_managers"
on public.roster
for delete
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
);

insert into public.member_roles (email, app_role)
values
  ('benjamin.broadhead.2@us.af.mil', 'fitflight_creator'),
  ('jacob.de.la.rosa@us.af.mil', 'ufpm'),
  ('benjamin.isenberg@us.af.mil', 'squadron_leadership'),
  ('jessica.kick@us.af.mil', 'squadron_leadership'),
  ('nicky.spader@us.af.mil', 'squadron_leadership')
on conflict (email) do update
set app_role = excluded.app_role;
