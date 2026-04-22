begin;

-- Reassign specific shared workouts so the app shows the desired "by <rank> <last name>"
-- attribution using the same member identity path as in-app submissions.
--
-- Morning HIIT Circuit:
-- - reassigns creator to SSgt Broadhead's auth-linked roster identity
-- - clears edited_by / edited_at so "edited by SSgt Benjamin Broadhead" disappears
--
-- Ultimate Football:
-- - reassigns creator to Lt. Col. Spader's auth-linked roster identity
--
-- Notes:
-- - This prefers AUTH_USER_ID when available.
-- - For roster members who have not logged in yet, it falls back to the same stable
--   roster-style member id the app generates locally:
--   roster-<rank>-<last>-<first>-<flight>

create or replace function public.fitflight_slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

with broadhead as (
  select coalesce(
    nullif(r."AUTH_USER_ID", ''),
    'roster-' || public.fitflight_slugify(
      concat_ws('-', r."RANK", split_part(r."FULL_NAME", ',', 1), trim(split_part(r."FULL_NAME", ',', 2)), r."FLT-DET")
    )
  ) as member_id
  from public.roster r
  where lower(coalesce(r."EMAIL", '')) = 'benjamin.broadhead.2@us.af.mil'
  limit 1
),
spader as (
  select coalesce(
    nullif(r."AUTH_USER_ID", ''),
    'roster-' || public.fitflight_slugify(
      concat_ws('-', r."RANK", split_part(r."FULL_NAME", ',', 1), trim(split_part(r."FULL_NAME", ',', 2)), r."FLT-DET")
    )
  ) as member_id
  from public.roster r
  where (
      lower(coalesce(r."FULL_NAME", '')) like 'spader,%'
      or lower(coalesce(r."EMAIL", '')) like '%spader%'
    )
    and lower(replace(replace(trim(coalesce(r."RANK", '')), '.', ''), '  ', ' ')) like 'lt col%'
  limit 1
)
update public.shared_workouts sw
set
  created_by = case
    when sw.name = 'Morning HIIT Circuit' then coalesce((select member_id from broadhead), sw.created_by)
    when sw.name = 'Ultimate Football' then coalesce((select member_id from spader), sw.created_by)
    else sw.created_by
  end,
  edited_by = case
    when sw.name = 'Morning HIIT Circuit' then null
    else sw.edited_by
  end,
  edited_at = case
    when sw.name = 'Morning HIIT Circuit' then null
    else sw.edited_at
  end
where sw.name in ('Morning HIIT Circuit', 'Ultimate Football');

commit;

-- Verification
select
  sw.name,
  sw.created_by,
  sw.edited_by,
  sw.edited_at,
  r."FULL_NAME" as matched_roster_name,
  r."EMAIL" as matched_roster_email
from public.shared_workouts sw
left join public.roster r
  on coalesce(nullif(r."AUTH_USER_ID", ''), 'roster-' || public.fitflight_slugify(
    concat_ws('-', r."RANK", split_part(r."FULL_NAME", ',', 1), trim(split_part(r."FULL_NAME", ',', 2)), r."FLT-DET")
  )) = sw.created_by
where sw.name in ('Morning HIIT Circuit', 'Ultimate Football')
order by sw.name;
