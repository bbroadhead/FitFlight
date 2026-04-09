create table if not exists public.scheduled_pt_sessions (
  id text primary key,
  session_date date not null,
  session_time text not null,
  description text not null,
  squadron text not null,
  flights text[] not null default '{}',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduled_pt_sessions_squadron_date
  on public.scheduled_pt_sessions(squadron, session_date, session_time);

drop trigger if exists scheduled_pt_sessions_set_updated_at on public.scheduled_pt_sessions;
create trigger scheduled_pt_sessions_set_updated_at
before update on public.scheduled_pt_sessions
for each row
execute function public.set_updated_at();

alter table public.scheduled_pt_sessions enable row level security;

drop policy if exists "scheduled_pt_sessions_select_authenticated" on public.scheduled_pt_sessions;
create policy "scheduled_pt_sessions_select_authenticated"
on public.scheduled_pt_sessions
for select
to authenticated
using (true);

drop policy if exists "scheduled_pt_sessions_manage_power_users" on public.scheduled_pt_sessions;
create policy "scheduled_pt_sessions_manage_power_users"
on public.scheduled_pt_sessions
for all
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
);
