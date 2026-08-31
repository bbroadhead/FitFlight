-- FitFlight 1.1.0 attendance stabilization
-- Safe to run after attendance_rls.sql. It preserves existing rows.

create index if not exists pt_sessions_squadron_date_flight_idx
  on public.pt_sessions (squadron, date, flight);

create index if not exists pt_session_attendees_member_session_idx
  on public.pt_session_attendees (member_id, session_id);

alter table public.member_roles
  drop constraint if exists member_roles_app_role_check;

alter table public.member_roles
  add constraint member_roles_app_role_check
  check (app_role in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'group_personnel', 'pfl', 'ptl', 'standard'));

-- A member can read their own squadron. Knights personnel can read the Group
-- and its child squadrons so Group Analytics remains functional.
create or replace function public.can_access_fitflight_squadron(p_squadron text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with identity as (
    select lower(coalesce(auth.jwt() ->> 'email', '')) as email
  )
  select exists (
    select 1 from identity i
    where public.current_member_role() in ('fitflight_creator', 'demo')
       or exists (select 1 from public.roster r where lower(coalesce(r."EMAIL", '')) = i.email and lower(p_squadron) = 'hawks')
       or exists (select 1 from public.tigers_roster r where lower(coalesce(r."EMAIL", '')) = i.email and lower(p_squadron) = 'tigers')
       or exists (select 1 from public.krakens_roster r where lower(coalesce(r."EMAIL", '')) = i.email and lower(p_squadron) = 'krakens')
       or exists (select 1 from public.warriors_roster r where lower(coalesce(r."EMAIL", '')) = i.email and lower(p_squadron) = 'warriors')
       or exists (select 1 from public.knights_roster r where lower(coalesce(r."EMAIL", '')) = i.email)
  );
$$;

create or replace function public.can_manage_fitflight_attendance(p_squadron text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_fitflight_squadron(p_squadron)
     and public.current_member_role() in (
       'fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'group_personnel', 'pfl', 'ptl'
     );
$$;

grant execute on function public.can_access_fitflight_squadron(text) to authenticated;
grant execute on function public.can_manage_fitflight_attendance(text) to authenticated;

-- Roster reads must be tenant-scoped as well. Group personnel and the
-- FitFlight Creator retain the authorized overview of child squadrons.
drop policy if exists "roster_select_authenticated" on public.roster;
create policy "roster_select_authorized_squadron"
on public.roster for select to authenticated
using (public.can_access_fitflight_squadron('Hawks'));

drop policy if exists "tigers_roster_select_authenticated" on public.tigers_roster;
create policy "tigers_roster_select_authorized_squadron"
on public.tigers_roster for select to authenticated
using (public.can_access_fitflight_squadron('Tigers'));

drop policy if exists "krakens_roster_select_authenticated" on public.krakens_roster;
create policy "krakens_roster_select_authorized_squadron"
on public.krakens_roster for select to authenticated
using (public.can_access_fitflight_squadron('Krakens'));

drop policy if exists "warriors_roster_select_authenticated" on public.warriors_roster;
create policy "warriors_roster_select_authorized_squadron"
on public.warriors_roster for select to authenticated
using (public.can_access_fitflight_squadron('Warriors'));

drop policy if exists "knights_roster_select_authenticated" on public.knights_roster;
create policy "knights_roster_select_authorized_squadron"
on public.knights_roster for select to authenticated
using (public.can_access_fitflight_squadron('Knights'));

drop policy if exists "pt_sessions_select_authenticated" on public.pt_sessions;
create policy "pt_sessions_select_authorized_squadron"
on public.pt_sessions
for select
to authenticated
using (public.can_access_fitflight_squadron(squadron));

drop policy if exists "pt_sessions_manage_power_users" on public.pt_sessions;
create policy "pt_sessions_manage_authorized_squadron"
on public.pt_sessions
for all
to authenticated
using (public.can_manage_fitflight_attendance(squadron))
with check (public.can_manage_fitflight_attendance(squadron));

drop policy if exists "pt_session_attendees_select_authenticated" on public.pt_session_attendees;
create policy "pt_session_attendees_select_authorized_squadron"
on public.pt_session_attendees
for select
to authenticated
using (
  exists (
    select 1
    from public.pt_sessions session
    where session.id = pt_session_attendees.session_id
      and public.can_access_fitflight_squadron(session.squadron)
  )
);

drop policy if exists "pt_session_attendees_manage_power_users" on public.pt_session_attendees;
create policy "pt_session_attendees_manage_authorized_squadron"
on public.pt_session_attendees
for all
to authenticated
using (
  exists (
    select 1
    from public.pt_sessions session
    where session.id = pt_session_attendees.session_id
      and public.can_manage_fitflight_attendance(session.squadron)
  )
)
with check (
  exists (
    select 1
    from public.pt_sessions session
    where session.id = pt_session_attendees.session_id
      and public.can_manage_fitflight_attendance(session.squadron)
  )
);

-- Rollback (if needed): re-run supabase/sql/attendance_rls.sql.
