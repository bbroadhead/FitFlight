drop function if exists public.ensure_roster_import_schema(text);
create or replace function public.ensure_roster_import_schema(p_squadron text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_member_role();
  v_squadron text := lower(trim(coalesce(p_squadron, '')));
  v_table text;
begin
  if v_role not in ('fitflight_creator', 'ufpm', 'demo', 'squadron_leadership', 'group_personnel', 'pfl', 'ptl') then
    raise exception 'You do not have permission to prepare roster imports.';
  end if;

  v_table := case v_squadron
    when 'hawks' then 'roster'
    when 'tigers' then 'tigers_roster'
    when 'krakens' then 'krakens_roster'
    when 'warriors' then 'warriors_roster'
    when 'knights' then 'knights_roster'
    else null
  end;

  if v_table is null then
    raise exception 'Unsupported squadron for roster import bootstrap: %', p_squadron;
  end if;

  execute format('alter table if exists public.%I add column if not exists "SHOW_WORKOUT_HISTORY_ON_PROFILE" boolean not null default true', v_table);
  execute format('alter table if exists public.%I add column if not exists "SHOW_WORKOUT_UPLOADS_ON_PROFILE" boolean not null default true', v_table);
  execute format('alter table if exists public.%I add column if not exists "SHOW_PFRA_RECORDS_ON_PROFILE" boolean not null default true', v_table);
  execute format('alter table if exists public.%I add column if not exists "SHOW_UPDATE_NOTES" boolean not null default true', v_table);
  execute format('alter table if exists public.%I add column if not exists "APP_THEME" text not null default ''default''', v_table);
  execute format('alter table if exists public.%I add column if not exists "AUTH_USER_ID" text', v_table);
  execute format('alter table if exists public.%I add column if not exists "MUST_CHANGE_PASSWORD" boolean not null default false', v_table);
  execute format('alter table if exists public.%I add column if not exists "HAS_LOGGED_INTO_APP" boolean not null default false', v_table);
end;
$$;

grant execute on function public.ensure_roster_import_schema(text) to authenticated;
