create table if not exists public.pt_sessions (
  id text primary key,
  date date not null,
  flight text not null,
  squadron text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (date, flight, squadron)
);

create table if not exists public.pt_session_attendees (
  session_id text not null references public.pt_sessions(id) on delete cascade,
  member_id text not null,
  attendance_source text not null default 'manual',
  created_at timestamptz not null default now(),
  primary key (session_id, member_id),
  constraint pt_session_attendees_attendance_source_check check (attendance_source in ('manual', 'workout'))
);

alter table public.pt_session_attendees
  add column if not exists attendance_source text not null default 'manual';

alter table public.pt_session_attendees
  drop constraint if exists pt_session_attendees_attendance_source_check;

alter table public.pt_session_attendees
  add constraint pt_session_attendees_attendance_source_check check (attendance_source in ('manual', 'workout'));

alter table public.pt_sessions enable row level security;
alter table public.pt_session_attendees enable row level security;

drop policy if exists "pt_sessions_select_authenticated" on public.pt_sessions;
create policy "pt_sessions_select_authenticated"
on public.pt_sessions
for select
to authenticated
using (true);

drop policy if exists "pt_sessions_manage_power_users" on public.pt_sessions;
create policy "pt_sessions_manage_power_users"
on public.pt_sessions
for all
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
);

drop policy if exists "pt_session_attendees_select_authenticated" on public.pt_session_attendees;
create policy "pt_session_attendees_select_authenticated"
on public.pt_session_attendees
for select
to authenticated
using (true);

drop policy if exists "pt_session_attendees_manage_power_users" on public.pt_session_attendees;
create policy "pt_session_attendees_manage_power_users"
on public.pt_session_attendees
for all
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
);
