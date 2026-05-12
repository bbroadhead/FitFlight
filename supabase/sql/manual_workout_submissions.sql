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
  duration_seconds integer not null default 0,
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

alter table public.manual_workout_submissions
  add column if not exists duration_seconds integer not null default 0;

alter table public.manual_workout_submissions
  add column if not exists proof_image_data_list text[] null;

alter table public.manual_workout_submissions
  add column if not exists workout_types text[] null;

alter table public.manual_workout_submissions
  add column if not exists workout_details jsonb null;

update public.manual_workout_submissions
set proof_image_data_list = array[proof_image_data]
where proof_image_data is not null
  and (
    proof_image_data_list is null
    or cardinality(proof_image_data_list) = 0
  );

update public.manual_workout_submissions
set workout_types = array[workout_type]
where workout_types is null
  or cardinality(workout_types) = 0;

update public.manual_workout_submissions
set workout_details = jsonb_build_array(
  jsonb_build_object(
    'type', workout_type,
    'duration', duration,
    'durationSeconds', coalesce(duration_seconds, 0),
    'distance', distance
  )
)
where workout_details is null
  or jsonb_array_length(workout_details) = 0;

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
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
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
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
)
with check (
  member_id = coalesce(auth.uid()::text, '')
  or lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'pfl', 'ptl')
);
