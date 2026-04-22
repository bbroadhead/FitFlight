create table if not exists public.pfra_records (
  id text primary key,
  member_id text not null,
  member_email text not null,
  squadron text not null,
  recorded_by_member_id text null,
  recorded_by_name text null,
  record_type text not null default 'self',
  batch_id text null,
  assessment_date date not null,
  overall_score numeric not null,
  is_private boolean not null default false,
  cardio_score numeric not null,
  cardio_time text null,
  cardio_laps integer null,
  cardio_test text null,
  cardio_exempt boolean not null default false,
  strength_score numeric not null,
  strength_reps integer null,
  strength_test text null,
  strength_exempt boolean not null default false,
  core_score numeric not null,
  core_reps integer null,
  core_time text null,
  core_test text null,
  core_exempt boolean not null default false,
  waist_score numeric null,
  waist_inches numeric null,
  waist_exempt boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.pfra_records
  add column if not exists recorded_by_member_id text null;

alter table public.pfra_records
  add column if not exists recorded_by_name text null;

alter table public.pfra_records
  add column if not exists record_type text not null default 'self';

alter table public.pfra_records
  add column if not exists batch_id text null;

alter table public.pfra_records
  add column if not exists updated_at timestamptz not null default now();

alter table public.pfra_records
drop constraint if exists pfra_records_record_type_check;

alter table public.pfra_records
add constraint pfra_records_record_type_check
check (record_type in ('self', 'mock', 'diagnostic', 'official'));

drop trigger if exists pfra_records_set_updated_at on public.pfra_records;

create trigger pfra_records_set_updated_at
before update on public.pfra_records
for each row
execute function public.set_updated_at();

create index if not exists idx_pfra_records_member_id
  on public.pfra_records(member_id);

create index if not exists idx_pfra_records_member_email
  on public.pfra_records(member_email);

create index if not exists idx_pfra_records_squadron_date
  on public.pfra_records(squadron, assessment_date desc);

create index if not exists idx_pfra_records_type_date
  on public.pfra_records(record_type, assessment_date desc);

create index if not exists idx_pfra_records_batch_id
  on public.pfra_records(batch_id);

alter table public.pfra_records enable row level security;

drop policy if exists "pfra_records_select_authenticated" on public.pfra_records;
create policy "pfra_records_select_authenticated"
on public.pfra_records
for select
to authenticated
using (true);

drop policy if exists "pfra_records_insert_self_or_admin" on public.pfra_records;
create policy "pfra_records_insert_self_or_admin"
on public.pfra_records
for insert
to authenticated
with check (
  lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'ptl')
);

drop policy if exists "pfra_records_update_self_or_admin" on public.pfra_records;
create policy "pfra_records_update_self_or_admin"
on public.pfra_records
for update
to authenticated
using (
  lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'ptl')
)
with check (
  lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'ptl')
);

drop policy if exists "pfra_records_delete_self_or_admin" on public.pfra_records;
create policy "pfra_records_delete_self_or_admin"
on public.pfra_records
for delete
to authenticated
using (
  lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'ptl')
);
