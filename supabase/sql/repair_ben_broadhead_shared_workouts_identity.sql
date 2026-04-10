begin;

-- One-time repair for Benjamin Broadhead's shared workout creator identity.
-- Safe scope:
-- - only updates rows currently pointing at the legacy roster-style id
-- - leaves rows already using the auth user id untouched

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

-- Preview rows that will be repaired.
select id, name, created_by
from public.shared_workouts sw
join target_identity ti on sw.created_by = ti.legacy_member_id
order by created_at desc;

update public.shared_workouts sw
set created_by = ti.auth_user_id
from target_identity ti
where sw.created_by = ti.legacy_member_id;

commit;

-- Verification: repaired rows should now point at the auth user id.
select id, name, created_by
from public.shared_workouts sw
join target_identity ti on sw.created_by = ti.auth_user_id
where lower(coalesce(sw.created_by, '')) = lower(coalesce(ti.auth_user_id, ''))
order by created_at desc;
