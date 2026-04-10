alter table public.roster
add column if not exists "AUTH_USER_ID" text;

do $$
begin
  if to_regclass('public.tigers_roster') is not null then
    execute 'alter table public.tigers_roster add column if not exists "AUTH_USER_ID" text';
  end if;
end $$;

update public.roster r
set "AUTH_USER_ID" = u.id::text
from auth.users u
where lower(coalesce(r."EMAIL", '')) = lower(coalesce(u.email, ''))
  and coalesce(r."EMAIL", '') <> ''
  and coalesce(r."AUTH_USER_ID", '') <> u.id::text;

do $$
begin
  if to_regclass('public.tigers_roster') is not null then
    execute $sql$
      update public.tigers_roster r
      set "AUTH_USER_ID" = u.id::text
      from auth.users u
      where lower(coalesce(r."EMAIL", '')) = lower(coalesce(u.email, ''))
        and coalesce(r."EMAIL", '') <> ''
        and coalesce(r."AUTH_USER_ID", '') <> u.id::text
    $sql$;
  end if;
end $$;

create temp table member_identity_map (
  email text,
  auth_user_id text,
  legacy_member_id text
) on commit drop;

insert into member_identity_map (email, auth_user_id, legacy_member_id)
select
  lower("EMAIL") as email,
  "AUTH_USER_ID" as auth_user_id,
  'roster-' || trim(both '-' from regexp_replace(
    lower(
      coalesce("RANK", '') || '-' ||
      split_part(coalesce("FULL_NAME", ''), ',', 1) || '-' ||
      trim(split_part(coalesce("FULL_NAME", ''), ',', 2)) || '-' ||
      case upper(coalesce("FLT-DET", ''))
        when 'APEX' then 'Apex'
        when 'A FLT' then 'Apex'
        when 'BOMBER' then 'Bomber'
        when 'B FLT' then 'Bomber'
        when 'CRYPTID' then 'Cryptid'
        when 'C FLT' then 'Cryptid'
        when 'DOOM' then 'Doom'
        when 'D FLT' then 'Doom'
        when 'EWOK' then 'Ewok'
        when 'E FLT' then 'Ewok'
        when 'FOXHOUND' then 'Foxhound'
        when 'F FLT' then 'Foxhound'
        when 'ADF' then 'ADF'
        when 'DET' then 'DET'
        when 'DET 1' then 'DET'
        else coalesce("FLT-DET", '')
      end
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  )) as legacy_member_id
from public.roster
where coalesce("AUTH_USER_ID", '') <> ''
  and coalesce("EMAIL", '') <> '';

do $$
begin
  if to_regclass('public.tigers_roster') is not null then
    execute $sql$
      insert into member_identity_map (email, auth_user_id, legacy_member_id)
      select
        lower("EMAIL") as email,
        "AUTH_USER_ID" as auth_user_id,
        'roster-' || trim(both '-' from regexp_replace(
          lower(
            coalesce("RANK", '') || '-' ||
            split_part(coalesce("FULL_NAME", ''), ',', 1) || '-' ||
            trim(split_part(coalesce("FULL_NAME", ''), ',', 2)) || '-' ||
            case upper(coalesce("FLT-DET", ''))
              when 'APEX' then 'Apex'
              when 'A FLT' then 'Apex'
              when 'BOMBER' then 'Bomber'
              when 'B FLT' then 'Bomber'
              when 'CRYPTID' then 'Cryptid'
              when 'C FLT' then 'Cryptid'
              when 'DOOM' then 'Doom'
              when 'D FLT' then 'Doom'
              when 'EWOK' then 'Ewok'
              when 'E FLT' then 'Ewok'
              when 'FOXHOUND' then 'Foxhound'
              when 'F FLT' then 'Foxhound'
              when 'ADF' then 'ADF'
              when 'DET' then 'DET'
              when 'DET 1' then 'DET'
              else coalesce("FLT-DET", '')
            end
          ),
          '[^a-z0-9]+',
          '-',
          'g'
        )) as legacy_member_id
      from public.tigers_roster
      where coalesce("AUTH_USER_ID", '') <> ''
        and coalesce("EMAIL", '') <> ''
    $sql$;
  end if;
end $$;

update public.manual_workout_submissions m
set member_id = map.auth_user_id
from member_identity_map map
where (
    lower(coalesce(m.member_email, '')) = map.email
    or m.member_id = map.legacy_member_id
  )
  and m.member_id <> map.auth_user_id;

update public.pfra_records p
set member_id = map.auth_user_id
from member_identity_map map
where (
    lower(coalesce(p.member_email, '')) = map.email
    or p.member_id = map.legacy_member_id
  )
  and p.member_id <> map.auth_user_id;

update public.pt_session_attendees a
set member_id = map.auth_user_id
from member_identity_map map
where a.member_id = map.legacy_member_id
  and a.member_id <> map.auth_user_id;

update public.pt_sessions s
set created_by = map.auth_user_id
from member_identity_map map
where s.created_by = map.legacy_member_id
  and s.created_by <> map.auth_user_id;

update public.scheduled_pt_sessions s
set created_by = map.auth_user_id
from member_identity_map map
where s.created_by = map.legacy_member_id
  and s.created_by <> map.auth_user_id;

update public.shared_workouts w
set created_by = map.auth_user_id
from member_identity_map map
where w.created_by = map.legacy_member_id
  and w.created_by <> map.auth_user_id;

update public.app_notifications n
set sender_member_id = map.auth_user_id
from member_identity_map map
where n.sender_member_id = map.legacy_member_id
  and n.sender_member_id <> map.auth_user_id;

update public.app_notifications n
set recipient_member_id = map.auth_user_id
from member_identity_map map
where n.recipient_member_id = map.legacy_member_id
  and n.recipient_member_id <> map.auth_user_id;

update public.support_threads t
set requester_member_id = map.auth_user_id
from member_identity_map map
where (
    lower(coalesce(t.requester_email, '')) = map.email
    or t.requester_member_id = map.legacy_member_id
  )
  and t.requester_member_id <> map.auth_user_id;

update public.support_messages m
set sender_member_id = map.auth_user_id
from member_identity_map map
where (
    lower(coalesce(m.sender_email, '')) = map.email
    or m.sender_member_id = map.legacy_member_id
  )
  and m.sender_member_id <> map.auth_user_id;
