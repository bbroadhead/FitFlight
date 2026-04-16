create table if not exists public.pfra_batches (
  id text primary key,
  squadron text not null,
  record_type text not null check (record_type in ('mock', 'diagnostic', 'official')),
  assessment_date date not null,
  selected_flights text[] not null default '{}',
  created_by_member_id text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pfra_batch_members (
  id bigserial primary key,
  batch_id text not null references public.pfra_batches(id) on delete cascade,
  member_id text not null,
  member_email text not null,
  member_name text not null,
  flight text not null,
  accountability_status text not null check (accountability_status in ('completed', 'pending', 'absent', 'excused', 'postponed')),
  age_years integer null,
  gender text null,
  height_inches numeric null,
  pfra_record_id text null references public.pfra_records(id) on delete set null,
  overall_score numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, member_id)
);

alter table public.pfra_batch_members
  add column if not exists age_years integer null;

alter table public.pfra_batch_members
  add column if not exists gender text null;

alter table public.pfra_batch_members
  add column if not exists height_inches numeric null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pfra_batches_set_updated_at on public.pfra_batches;
create trigger pfra_batches_set_updated_at
before update on public.pfra_batches
for each row
execute function public.set_updated_at();

drop trigger if exists pfra_batch_members_set_updated_at on public.pfra_batch_members;
create trigger pfra_batch_members_set_updated_at
before update on public.pfra_batch_members
for each row
execute function public.set_updated_at();

create index if not exists idx_pfra_batches_squadron_date
  on public.pfra_batches(squadron, assessment_date desc);

create index if not exists idx_pfra_batch_members_batch_status
  on public.pfra_batch_members(batch_id, accountability_status);

create index if not exists idx_pfra_batch_members_member_id
  on public.pfra_batch_members(member_id);

alter table public.pfra_batches enable row level security;
alter table public.pfra_batch_members enable row level security;

drop policy if exists "pfra_batches_select_authenticated" on public.pfra_batches;
create policy "pfra_batches_select_authenticated"
on public.pfra_batches
for select
to authenticated
using (true);

drop policy if exists "pfra_batches_manage_pfra_roles" on public.pfra_batches;
create policy "pfra_batches_manage_pfra_roles"
on public.pfra_batches
for all
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
);

drop policy if exists "pfra_batch_members_select_authenticated" on public.pfra_batch_members;
create policy "pfra_batch_members_select_authenticated"
on public.pfra_batch_members
for select
to authenticated
using (true);

drop policy if exists "pfra_batch_members_manage_pfra_roles" on public.pfra_batch_members;
create policy "pfra_batch_members_manage_pfra_roles"
on public.pfra_batch_members
for all
to authenticated
using (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
)
with check (
  public.current_member_role() in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl')
);

drop function if exists public.bulk_save_pfra_batch(text, text, text, date, text[], text, text, jsonb);
create or replace function public.bulk_save_pfra_batch(
  p_batch_id text,
  p_squadron text,
  p_record_type text,
  p_assessment_date date,
  p_selected_flights text[],
  p_created_by_member_id text,
  p_created_by_name text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_member_role();
  v_existing_date date;
  v_existing_squadron text;
  v_existing_type text;
  v_saved_count integer;
  v_completed_count integer;
begin
  if v_role not in ('fitflight_creator', 'ufpm', 'squadron_leadership', 'ptl') then
    raise exception 'You do not have permission to bulk save PFRA results.';
  end if;

  if p_record_type not in ('mock', 'diagnostic', 'official') then
    raise exception 'Invalid PFRA record type.';
  end if;

  create temporary table if not exists tmp_pfra_bulk_rows (
    record_id text,
    member_id text,
    member_email text,
    member_name text,
    flight text,
    accountability_status text,
    age_years integer,
    gender text,
    height_inches numeric,
    overall_score numeric,
    is_private boolean,
    cardio_score numeric,
    cardio_time text,
    cardio_laps integer,
    cardio_test text,
    cardio_exempt boolean,
    strength_score numeric,
    strength_reps integer,
    strength_test text,
    strength_exempt boolean,
    core_score numeric,
    core_reps integer,
    core_time text,
    core_test text,
    core_exempt boolean,
    waist_score numeric,
    waist_inches numeric,
    waist_exempt boolean
  ) on commit drop;

  truncate table tmp_pfra_bulk_rows;

  insert into tmp_pfra_bulk_rows (
    record_id,
    member_id,
    member_email,
    member_name,
    flight,
    accountability_status,
    age_years,
    gender,
    height_inches,
    overall_score,
    is_private,
    cardio_score,
    cardio_time,
    cardio_laps,
    cardio_test,
    cardio_exempt,
    strength_score,
    strength_reps,
    strength_test,
    strength_exempt,
    core_score,
    core_reps,
    core_time,
    core_test,
    core_exempt,
    waist_score,
    waist_inches,
    waist_exempt
  )
  select
    x.record_id,
    x.member_id,
    lower(x.member_email),
    x.member_name,
    x.flight,
    x.accountability_status,
    x.age_years,
    x.gender,
    x.height_inches,
    x.overall_score,
    coalesce(x.is_private, false),
    x.cardio_score,
    x.cardio_time,
    x.cardio_laps,
    x.cardio_test,
    coalesce(x.cardio_exempt, false),
    x.strength_score,
    x.strength_reps,
    x.strength_test,
    coalesce(x.strength_exempt, false),
    x.core_score,
    x.core_reps,
    x.core_time,
    x.core_test,
    coalesce(x.core_exempt, false),
    x.waist_score,
    x.waist_inches,
    coalesce(x.waist_exempt, false)
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    record_id text,
    member_id text,
    member_email text,
    member_name text,
    flight text,
    accountability_status text,
    age_years integer,
    gender text,
    height_inches numeric,
    overall_score numeric,
    is_private boolean,
    cardio_score numeric,
    cardio_time text,
    cardio_laps integer,
    cardio_test text,
    cardio_exempt boolean,
    strength_score numeric,
    strength_reps integer,
    strength_test text,
    strength_exempt boolean,
    core_score numeric,
    core_reps integer,
    core_time text,
    core_test text,
    core_exempt boolean,
    waist_score numeric,
    waist_inches numeric,
    waist_exempt boolean
  );

  if exists (select 1 from public.pfra_batches where id = p_batch_id) then
    select assessment_date, squadron, record_type
    into v_existing_date, v_existing_squadron, v_existing_type
    from public.pfra_batches
    where id = p_batch_id;

    if v_existing_type = 'mock' then
      delete from public.pt_session_attendees attendee
      using public.pt_sessions session,
            public.pfra_batch_members batch_member
      where batch_member.batch_id = p_batch_id
        and batch_member.accountability_status = 'completed'
        and session.date = v_existing_date
        and session.squadron = v_existing_squadron
        and session.flight = batch_member.flight
        and attendee.session_id = session.id
        and attendee.member_id = batch_member.member_id
        and attendee.attendance_source = 'pfra';

      delete from public.pt_sessions session
      where session.date = v_existing_date
        and session.squadron = v_existing_squadron
        and not exists (
          select 1
          from public.pt_session_attendees attendee
          where attendee.session_id = session.id
        );
    end if;

    delete from public.pfra_batch_members where batch_id = p_batch_id;
    delete from public.pfra_records where batch_id = p_batch_id;
  end if;

  insert into public.pfra_batches (
    id,
    squadron,
    record_type,
    assessment_date,
    selected_flights,
    created_by_member_id,
    created_by_name
  )
  values (
    p_batch_id,
    p_squadron,
    p_record_type,
    p_assessment_date,
    coalesce(p_selected_flights, '{}'),
    p_created_by_member_id,
    p_created_by_name
  )
  on conflict (id) do update
  set squadron = excluded.squadron,
      record_type = excluded.record_type,
      assessment_date = excluded.assessment_date,
      selected_flights = excluded.selected_flights,
      created_by_member_id = excluded.created_by_member_id,
      created_by_name = excluded.created_by_name,
      updated_at = now();

  insert into public.pfra_records (
    id,
    member_id,
    member_email,
    squadron,
    recorded_by_member_id,
    recorded_by_name,
    record_type,
    batch_id,
    assessment_date,
    overall_score,
    is_private,
    cardio_score,
    cardio_time,
    cardio_laps,
    cardio_test,
    cardio_exempt,
    strength_score,
    strength_reps,
    strength_test,
    strength_exempt,
    core_score,
    core_reps,
    core_time,
    core_test,
    core_exempt,
    waist_score,
    waist_inches,
    waist_exempt
  )
  select
    record_id,
    member_id,
    member_email,
    p_squadron,
    p_created_by_member_id,
    p_created_by_name,
    p_record_type,
    p_batch_id,
    p_assessment_date,
    overall_score,
    is_private,
    cardio_score,
    cardio_time,
    cardio_laps,
    cardio_test,
    cardio_exempt,
    strength_score,
    strength_reps,
    strength_test,
    strength_exempt,
    core_score,
    core_reps,
    core_time,
    core_test,
    core_exempt,
    waist_score,
    waist_inches,
    waist_exempt
  from tmp_pfra_bulk_rows
  where accountability_status = 'completed';

  insert into public.pfra_batch_members (
    batch_id,
    member_id,
    member_email,
    member_name,
    flight,
    accountability_status,
    age_years,
    gender,
    height_inches,
    pfra_record_id,
    overall_score
  )
  select
    p_batch_id,
    member_id,
    member_email,
    member_name,
    flight,
    accountability_status,
    age_years,
    gender,
    height_inches,
    case when accountability_status = 'completed' then record_id else null end,
    case when accountability_status = 'completed' then overall_score else null end
  from tmp_pfra_bulk_rows;

  if p_record_type = 'mock' then
    insert into public.pt_sessions (
      id,
      date,
      flight,
      squadron,
      created_by
    )
    select
      'pfra-' || lower(replace(p_squadron, ' ', '-')) || '-' || lower(replace(flight, ' ', '-')) || '-' || replace(p_assessment_date::text, '-', ''),
      p_assessment_date,
      flight,
      p_squadron,
      p_created_by_member_id
    from (
      select distinct flight
      from tmp_pfra_bulk_rows
      where accountability_status = 'completed'
    ) completed_flights
    on conflict (date, flight, squadron) do nothing;

    insert into public.pt_session_attendees (
      session_id,
      member_id,
      attendance_source
    )
    select
      session.id,
      row.member_id,
      'pfra'
    from tmp_pfra_bulk_rows row
    join public.pt_sessions session
      on session.date = p_assessment_date
     and session.squadron = p_squadron
     and session.flight = row.flight
    where row.accountability_status = 'completed'
    on conflict (session_id, member_id) do update
      set attendance_source = 'pfra';
  end if;

  select count(*) into v_saved_count from tmp_pfra_bulk_rows;
  select count(*) into v_completed_count from tmp_pfra_bulk_rows where accountability_status = 'completed';

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'row_count', v_saved_count,
    'completed_count', v_completed_count,
    'absent_count', (select count(*) from tmp_pfra_bulk_rows where accountability_status = 'absent'),
    'excused_count', (select count(*) from tmp_pfra_bulk_rows where accountability_status = 'excused'),
    'pending_count', (select count(*) from tmp_pfra_bulk_rows where accountability_status = 'pending'),
    'postponed_count', (select count(*) from tmp_pfra_bulk_rows where accountability_status = 'postponed')
  );
end;
$$;
