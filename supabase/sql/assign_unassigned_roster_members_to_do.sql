begin;

-- Backfill roster members with no assigned flight into DO.
-- This treats null/blank flight values as unassigned.

update public.roster
set "FLT-DET" = 'DO'
where nullif(trim(coalesce("FLT-DET", '')), '') is null;

-- If additional squadron roster tables exist, backfill them too.
do $$
begin
  if to_regclass('public.tigers_roster') is not null then
    execute $sql$
      update public.tigers_roster
      set "FLT-DET" = 'DO'
      where nullif(trim(coalesce("FLT-DET", '')), '') is null
    $sql$;
  end if;
  if to_regclass('public.krakens_roster') is not null then
    execute $sql$
      update public.krakens_roster
      set "FLT-DET" = 'DO'
      where nullif(trim(coalesce("FLT-DET", '')), '') is null
    $sql$;
  end if;
  if to_regclass('public.warriors_roster') is not null then
    execute $sql$
      update public.warriors_roster
      set "FLT-DET" = 'DO'
      where nullif(trim(coalesce("FLT-DET", '')), '') is null
    $sql$;
  end if;
end $$;

commit;

-- Verification
select
  count(*) as remaining_unassigned_roster_flights
from public.roster
where nullif(trim(coalesce("FLT-DET", '')), '') is null;
