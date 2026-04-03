create table if not exists public.strava_connections (
  user_id text primary key,
  email text not null,
  strava_athlete_id bigint not null unique,
  athlete_first_name text,
  athlete_last_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.strava_activity_imports (
  id bigint generated always as identity primary key,
  user_id text not null,
  strava_activity_id bigint not null unique,
  name text,
  activity_type text not null,
  start_date timestamptz not null,
  duration_minutes integer not null,
  distance_miles numeric(10,2),
  is_private boolean not null default false,
  raw jsonb not null,
  imported_at timestamptz not null default now()
);

create index if not exists strava_activity_imports_user_id_idx
  on public.strava_activity_imports (user_id);

create index if not exists strava_activity_imports_start_date_idx
  on public.strava_activity_imports (start_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists strava_connections_set_updated_at on public.strava_connections;

create trigger strava_connections_set_updated_at
before update on public.strava_connections
for each row
execute function public.set_updated_at();
