create table if not exists public.scheduled_pt_sessions (
  id text primary key,
  session_date date not null,
  session_time text not null,
  description text not null,
  squadron text not null,
  flights text[] not null default '{}',
  created_by text not null,
  session_scope text not null default 'flight',
  session_kind text not null default 'pt',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scheduled_pt_sessions
  add column if not exists session_scope text not null default 'flight';

alter table public.scheduled_pt_sessions
  add column if not exists session_kind text not null default 'pt';

alter table public.scheduled_pt_sessions
  drop constraint if exists scheduled_pt_sessions_session_scope_check;

alter table public.scheduled_pt_sessions
  add constraint scheduled_pt_sessions_session_scope_check
  check (session_scope in ('squadron', 'flight', 'personal'));

alter table public.scheduled_pt_sessions
  drop constraint if exists scheduled_pt_sessions_session_kind_check;

alter table public.scheduled_pt_sessions
  add constraint scheduled_pt_sessions_session_kind_check
  check (session_kind in ('pt', 'pfra_mock', 'pfra_diagnostic', 'pfra_official'));

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
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'ptl')
  or (
    session_scope = 'personal'
    and created_by = auth.uid()::text
  )
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'ptl')
  or (
    session_scope = 'personal'
    and created_by = auth.uid()::text
  )
);
