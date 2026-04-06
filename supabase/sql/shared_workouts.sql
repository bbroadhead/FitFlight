create table if not exists public.shared_workouts (
  id text primary key,
  name text not null,
  type text not null,
  duration integer not null,
  intensity integer not null,
  description text,
  is_multi_step boolean not null default false,
  steps text[] not null default '{}',
  created_by text not null,
  created_at timestamptz not null default now(),
  squadron text not null,
  thumbs_up text[] not null default '{}',
  thumbs_down text[] not null default '{}',
  favorited_by text[] not null default '{}'
);

alter table public.shared_workouts enable row level security;

drop policy if exists "shared_workouts_select_authenticated" on public.shared_workouts;
create policy "shared_workouts_select_authenticated"
on public.shared_workouts
for select
to authenticated
using (true);

drop policy if exists "shared_workouts_insert_authenticated" on public.shared_workouts;
create policy "shared_workouts_insert_authenticated"
on public.shared_workouts
for insert
to authenticated
with check (true);

drop policy if exists "shared_workouts_update_authenticated" on public.shared_workouts;
create policy "shared_workouts_update_authenticated"
on public.shared_workouts
for update
to authenticated
using (true)
with check (true);

drop policy if exists "shared_workouts_delete_authenticated" on public.shared_workouts;
create policy "shared_workouts_delete_authenticated"
on public.shared_workouts
for delete
to authenticated
using (true);
