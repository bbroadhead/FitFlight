create table if not exists public.tigers_roster (
  like public.roster including all
);

alter table public.tigers_roster enable row level security;

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
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'ptl')
);

drop policy if exists "tigers_roster_update_role_managers" on public.tigers_roster;
create policy "tigers_roster_update_role_managers"
on public.tigers_roster
for update
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'ptl')
);

drop policy if exists "tigers_roster_delete_role_managers" on public.tigers_roster;
create policy "tigers_roster_delete_role_managers"
on public.tigers_roster
for delete
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'ptl')
);

-- Pattern for future squadrons:
-- create table if not exists public.<squadron_name>_roster (like public.roster including all);
-- alter table public.<squadron_name>_roster enable row level security;
-- then create the same four policies above, replacing tigers_roster with <squadron_name>_roster.
