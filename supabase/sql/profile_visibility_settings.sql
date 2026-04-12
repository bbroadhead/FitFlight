alter table public.roster
add column if not exists "SHOW_WORKOUT_HISTORY_ON_PROFILE" boolean not null default true;

alter table public.roster
add column if not exists "SHOW_WORKOUT_UPLOADS_ON_PROFILE" boolean not null default true;

alter table public.roster
add column if not exists "SHOW_PFRA_RECORDS_ON_PROFILE" boolean not null default true;

alter table if exists public.tigers_roster
add column if not exists "SHOW_WORKOUT_HISTORY_ON_PROFILE" boolean not null default true;

alter table if exists public.tigers_roster
add column if not exists "SHOW_WORKOUT_UPLOADS_ON_PROFILE" boolean not null default true;

alter table if exists public.tigers_roster
add column if not exists "SHOW_PFRA_RECORDS_ON_PROFILE" boolean not null default true;
