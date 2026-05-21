create table if not exists public.tigers_roster (
  like public.roster including all
);

create table if not exists public.krakens_roster (
  like public.roster including all
);

create table if not exists public.warriors_roster (
  like public.roster including all
);

create table if not exists public.knights_roster (
  like public.roster including all
);

alter table public.tigers_roster enable row level security;
alter table public.krakens_roster enable row level security;
alter table public.warriors_roster enable row level security;
alter table public.knights_roster enable row level security;

drop policy if exists "tigers_roster_select_authenticated" on public.tigers_roster;
create policy "tigers_roster_select_authenticated"
on public.tigers_roster
for select
to authenticated
using (true);

drop policy if exists "tigers_roster_insert_role_managers" on public.tigers_roster;
create policy "tigers_roster_insert_role_managers"
on public.tigers_roster
for insert
to authenticated
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "tigers_roster_update_role_managers" on public.tigers_roster;
create policy "tigers_roster_update_role_managers"
on public.tigers_roster
for update
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "tigers_roster_delete_role_managers" on public.tigers_roster;
create policy "tigers_roster_delete_role_managers"
on public.tigers_roster
for delete
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "krakens_roster_select_authenticated" on public.krakens_roster;
create policy "krakens_roster_select_authenticated"
on public.krakens_roster
for select
to authenticated
using (true);

drop policy if exists "krakens_roster_insert_role_managers" on public.krakens_roster;
create policy "krakens_roster_insert_role_managers"
on public.krakens_roster
for insert
to authenticated
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "krakens_roster_update_role_managers" on public.krakens_roster;
create policy "krakens_roster_update_role_managers"
on public.krakens_roster
for update
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "krakens_roster_delete_role_managers" on public.krakens_roster;
create policy "krakens_roster_delete_role_managers"
on public.krakens_roster
for delete
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "warriors_roster_select_authenticated" on public.warriors_roster;
create policy "warriors_roster_select_authenticated"
on public.warriors_roster
for select
to authenticated
using (true);

drop policy if exists "warriors_roster_insert_role_managers" on public.warriors_roster;
create policy "warriors_roster_insert_role_managers"
on public.warriors_roster
for insert
to authenticated
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "warriors_roster_update_role_managers" on public.warriors_roster;
create policy "warriors_roster_update_role_managers"
on public.warriors_roster
for update
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "warriors_roster_delete_role_managers" on public.warriors_roster;
create policy "warriors_roster_delete_role_managers"
on public.warriors_roster
for delete
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "knights_roster_select_authenticated" on public.knights_roster;
create policy "knights_roster_select_authenticated"
on public.knights_roster
for select
to authenticated
using (true);

drop policy if exists "knights_roster_insert_role_managers" on public.knights_roster;
create policy "knights_roster_insert_role_managers"
on public.knights_roster
for insert
to authenticated
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "knights_roster_update_role_managers" on public.knights_roster;
create policy "knights_roster_update_role_managers"
on public.knights_roster
for update
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

drop policy if exists "knights_roster_delete_role_managers" on public.knights_roster;
create policy "knights_roster_delete_role_managers"
on public.knights_roster
for delete
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);

-- Pattern for future squadrons:
-- create table if not exists public.<squadron_name>_roster (like public.roster including all);
-- alter table public.<squadron_name>_roster enable row level security;
-- then create the same four policies above, replacing tigers_roster with <squadron_name>_roster.
