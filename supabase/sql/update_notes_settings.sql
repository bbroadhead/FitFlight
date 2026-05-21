alter table public.roster
add column if not exists "SHOW_UPDATE_NOTES" boolean not null default true;

alter table public.roster
add column if not exists "APP_THEME" text not null default 'default';

alter table if exists public.tigers_roster
add column if not exists "SHOW_UPDATE_NOTES" boolean not null default true;

alter table if exists public.tigers_roster
add column if not exists "APP_THEME" text not null default 'default';

alter table if exists public.krakens_roster
add column if not exists "SHOW_UPDATE_NOTES" boolean not null default true;

alter table if exists public.krakens_roster
add column if not exists "APP_THEME" text not null default 'default';

alter table if exists public.warriors_roster
add column if not exists "SHOW_UPDATE_NOTES" boolean not null default true;

alter table if exists public.warriors_roster
add column if not exists "APP_THEME" text not null default 'default';

alter table if exists public.knights_roster
add column if not exists "SHOW_UPDATE_NOTES" boolean not null default true;

alter table if exists public.knights_roster
add column if not exists "APP_THEME" text not null default 'default';
