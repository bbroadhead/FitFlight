create table if not exists public.manual_workout_submissions (
  id text primary key,
  member_id text not null,
  member_email text not null,
  member_name text not null,
  member_rank text not null,
  member_flight text not null,
  squadron text not null,
  workout_date date not null,
  workout_type text not null,
  duration integer not null,
  distance numeric null,
  is_private boolean not null default false,
  proof_image_data text not null,
  status text not null check (status in ('pending', 'approved', 'denied')) default 'pending',
  reviewer_member_id text null,
  reviewer_name text null,
  reviewer_note text null,
  attendance_marked_by_submission boolean not null default false,
  requester_read boolean not null default true,
  reviewer_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manual_workout_submissions
  add column if not exists attendance_marked_by_submission boolean not null default false;

create index if not exists idx_manual_workout_submissions_member_id
  on public.manual_workout_submissions(member_id);

create index if not exists idx_manual_workout_submissions_squadron_status
  on public.manual_workout_submissions(squadron, status);

alter table public.manual_workout_submissions enable row level security;

drop policy if exists "manual_workout_submissions_select_requester_or_reviewer" on public.manual_workout_submissions;
create policy "manual_workout_submissions_select_requester_or_reviewer"
on public.manual_workout_submissions
for select
to authenticated
using (
  member_id = coalesce(auth.uid()::text, '')
  or lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
);

drop policy if exists "manual_workout_submissions_insert_self" on public.manual_workout_submissions;
create policy "manual_workout_submissions_insert_self"
on public.manual_workout_submissions
for insert
to authenticated
with check (
  member_id = coalesce(auth.uid()::text, '')
  or lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "manual_workout_submissions_update_reviewer_or_requester" on public.manual_workout_submissions;
create policy "manual_workout_submissions_update_reviewer_or_requester"
on public.manual_workout_submissions
for update
to authenticated
using (
  member_id = coalesce(auth.uid()::text, '')
  or lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
)
with check (
  member_id = coalesce(auth.uid()::text, '')
  or lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
);
