create table if not exists public.attendance_weekly_excusals (
  week_start date not null,
  member_id text not null,
  squadron text not null,
  excused_by_member_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (week_start, member_id, squadron)
);

create index if not exists idx_attendance_weekly_excusals_squadron_week
  on public.attendance_weekly_excusals (squadron, week_start desc);

create or replace function public.set_attendance_weekly_excusals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attendance_weekly_excusals_set_updated_at on public.attendance_weekly_excusals;
create trigger attendance_weekly_excusals_set_updated_at
before update on public.attendance_weekly_excusals
for each row
execute function public.set_attendance_weekly_excusals_updated_at();

alter table public.attendance_weekly_excusals enable row level security;

drop policy if exists "attendance_weekly_excusals_select_authenticated" on public.attendance_weekly_excusals;
create policy "attendance_weekly_excusals_select_authenticated"
on public.attendance_weekly_excusals
for select
to authenticated
using (true);

drop policy if exists "attendance_weekly_excusals_manage_admin_roles" on public.attendance_weekly_excusals;
create policy "attendance_weekly_excusals_manage_admin_roles"
on public.attendance_weekly_excusals
for all
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership')
);
