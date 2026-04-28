begin;

-- One-time cleanup for Benjamin Isenberg's duplicate roster rows.
--
-- Goal:
-- - keep a single roster row
-- - preserve the row that already has AUTH_USER_ID when available
-- - ensure the surviving row is assigned to DO
-- - ensure the surviving row has squadron_leadership in member_roles
-- - remove any duplicate Benjamin Isenberg roster rows afterwards

create temp table if not exists target_isenberg_rows as
with candidates as (
  select
    ctid as row_pointer,
    coalesce("FULL_NAME", '') as full_name,
    coalesce("RANK", '') as rank,
    lower(coalesce("EMAIL", '')) as email,
    coalesce("FLT-DET", '') as flight,
    coalesce("AUTH_USER_ID", '') as auth_user_id,
    row_number() over (
      order by
        case when coalesce("AUTH_USER_ID", '') <> '' then 0 else 1 end,
        case when lower(coalesce("EMAIL", '')) <> '' then 0 else 1 end,
        case when upper(coalesce("FLT-DET", '')) = 'DO' then 0 else 1 end,
        case when coalesce("FULL_NAME", '') = 'Isenberg, Benjamin E' then 0 else 1 end
    ) as priority_rank
  from public.roster
  where lower(coalesce("FULL_NAME", '')) in ('isenberg, benjamin', 'isenberg, benjamin e')
)
select * from candidates;

-- Preview rows before repair.
select
  full_name,
  rank,
  email,
  flight,
  auth_user_id,
  priority_rank
from target_isenberg_rows
order by priority_rank;

with canonical as (
  select * from target_isenberg_rows where priority_rank = 1
),
merged as (
  select
    coalesce(
      nullif((select auth_user_id from target_isenberg_rows where auth_user_id <> '' order by priority_rank limit 1), ''),
      canonical.auth_user_id
    ) as auth_user_id,
    coalesce(
      nullif((select email from target_isenberg_rows where email <> '' order by priority_rank limit 1), ''),
      canonical.email
    ) as email,
    coalesce(
      nullif((select rank from target_isenberg_rows where rank <> '' order by priority_rank limit 1), ''),
      canonical.rank
    ) as rank,
    case
      when exists (select 1 from target_isenberg_rows where full_name = 'Isenberg, Benjamin E')
        then 'Isenberg, Benjamin E'
      else canonical.full_name
    end as full_name
  from canonical
)
update public.roster r
set
  "FULL_NAME" = merged.full_name,
  "RANK" = merged.rank,
  "EMAIL" = merged.email,
  "FLT-DET" = 'DO',
  "AUTH_USER_ID" = merged.auth_user_id
from canonical, merged
where r.ctid = canonical.row_pointer;

delete from public.roster r
using target_isenberg_rows dupes
where r.ctid = dupes.row_pointer
  and dupes.priority_rank > 1;

insert into public.member_roles (email, app_role)
select lower("EMAIL"), 'squadron_leadership'
from public.roster
where lower(coalesce("FULL_NAME", '')) in ('isenberg, benjamin', 'isenberg, benjamin e')
  and lower(coalesce("EMAIL", '')) <> ''
on conflict (email) do update
set
  app_role = 'squadron_leadership',
  updated_at = now();

commit;

-- Verification:
-- Expect exactly one roster row, assigned to DO, with AUTH_USER_ID populated if available,
-- and the role set to squadron_leadership.
select
  "FULL_NAME",
  "RANK",
  "EMAIL",
  "FLT-DET",
  "AUTH_USER_ID"
from public.roster
where lower(coalesce("FULL_NAME", '')) in ('isenberg, benjamin', 'isenberg, benjamin e')
order by "FULL_NAME";

select
  email,
  app_role
from public.member_roles
where lower(email) = (
  select lower(coalesce("EMAIL", ''))
  from public.roster
  where lower(coalesce("FULL_NAME", '')) in ('isenberg, benjamin', 'isenberg, benjamin e')
  limit 1
);
