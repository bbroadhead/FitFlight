do $$
begin
  create temporary table temp_do_members (
    email text primary key
  ) on commit drop;

  insert into temp_do_members (email)
  select lower("EMAIL")
  from public.roster
  where coalesce(trim("FLT-DET"), '') = 'DO';

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'tigers_roster'
  ) then
    insert into temp_do_members (email)
    select lower("EMAIL")
    from public.tigers_roster
    where coalesce(trim("FLT-DET"), '') = 'DO'
    on conflict (email) do nothing;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'krakens_roster'
  ) then
    insert into temp_do_members (email)
    select lower("EMAIL")
    from public.krakens_roster
    where coalesce(trim("FLT-DET"), '') = 'DO'
    on conflict (email) do nothing;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'warriors_roster'
  ) then
    insert into temp_do_members (email)
    select lower("EMAIL")
    from public.warriors_roster
    where coalesce(trim("FLT-DET"), '') = 'DO'
    on conflict (email) do nothing;
  end if;

  update public.member_roles mr
  set app_role = 'squadron_leadership'
  from temp_do_members dm
  where lower(mr.email) = dm.email;

  insert into public.member_roles (email, app_role)
  select dm.email, 'squadron_leadership'
  from temp_do_members dm
  where not exists (
    select 1
    from public.member_roles mr
    where lower(mr.email) = dm.email
  );
end $$;
