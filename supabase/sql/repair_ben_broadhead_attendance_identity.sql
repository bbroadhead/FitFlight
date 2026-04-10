begin;

-- One-time repair for Benjamin Broadhead's legacy-vs-auth attendance identity split.
-- This updates attendance-related rows that may have been written by an older deployed build
-- using the roster-style member id instead of the Supabase Auth user id.

create temp table if not exists target_identity as
with target as (
  select lower('benjamin.broadhead.2@us.af.mil') as email
),
roster_match as (
  select
    lower(coalesce(r."EMAIL", '')) as email,
    coalesce(r."AUTH_USER_ID", '') as auth_user_id,
    coalesce(r."RANK", '') as rank,
    split_part(coalesce(r."FULL_NAME", ''), ',', 1) as last_name,
    split_part(split_part(coalesce(r."FULL_NAME", ''), ',', 2), ' ', 2) as first_name,
    coalesce(r."FLT-DET", '') as flight
  from public.roster r
  join target t on lower(coalesce(r."EMAIL", '')) = t.email
),
normalized as (
  select
    email,
    auth_user_id,
    'roster-' ||
      trim(both '-' from regexp_replace(lower(
        regexp_replace(rank, '[^a-z0-9]+', '-', 'g') || '-' ||
        regexp_replace(last_name, '[^a-z0-9]+', '-', 'g') || '-' ||
        regexp_replace(first_name, '[^a-z0-9]+', '-', 'g') || '-' ||
        regexp_replace(flight, '[^a-z0-9]+', '-', 'g')
      ), '-+', '-', 'g')) as legacy_member_id
  from roster_match
  where auth_user_id <> ''
)
select * from normalized;

-- Audit current attendance rows before repair.
select
  s.date,
  s.flight,
  a.member_id
from public.pt_session_attendees a
join public.pt_sessions s on s.id = a.session_id
join target_identity ti on a.member_id in (ti.auth_user_id, ti.legacy_member_id)
order by s.date, s.flight, a.member_id;

-- Move legacy attendance attendees to the auth user id without creating duplicates.
insert into public.pt_session_attendees (session_id, member_id)
select a.session_id, ti.auth_user_id
from public.pt_session_attendees a
join target_identity ti on a.member_id = ti.legacy_member_id
where not exists (
  select 1
  from public.pt_session_attendees existing
  where existing.session_id = a.session_id
    and existing.member_id = ti.auth_user_id
);

delete from public.pt_session_attendees a
using target_identity ti
where a.member_id = ti.legacy_member_id;

-- Repair creator references for attendance sessions if needed.
update public.pt_sessions s
set created_by = ti.auth_user_id
from target_identity ti
where s.created_by = ti.legacy_member_id;

commit;

-- Verification: Benjamin's attendance should now be represented only by the auth user id.
with target as (
  select * from target_identity
)
select
  s.date,
  s.flight,
  a.member_id
from public.pt_session_attendees a
join public.pt_sessions s on s.id = a.session_id
join target t on a.member_id = t.auth_user_id
order by s.date, s.flight;
