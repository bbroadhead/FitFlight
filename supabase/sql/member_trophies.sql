create table if not exists public.member_trophies (
  id text primary key,
  member_id text null,
  member_email text not null,
  squadron text not null,
  trophy_id text not null,
  earned_at timestamptz not null default now(),
  awarded_by_member_id text null,
  is_active boolean not null default true,
  celebration_shown_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists member_trophies_member_email_trophy_id_idx
  on public.member_trophies (member_email, trophy_id);

alter table public.member_trophies enable row level security;

drop policy if exists "member_trophies_select_authenticated" on public.member_trophies;
create policy "member_trophies_select_authenticated"
on public.member_trophies
for select
to authenticated
using (true);

drop policy if exists "member_trophies_insert_authenticated" on public.member_trophies;
create policy "member_trophies_insert_authenticated"
on public.member_trophies
for insert
to authenticated
with check (true);

drop policy if exists "member_trophies_update_authenticated" on public.member_trophies;
create policy "member_trophies_update_authenticated"
on public.member_trophies
for update
to authenticated
using (true)
with check (true);

drop policy if exists "member_trophies_delete_authenticated" on public.member_trophies;
create policy "member_trophies_delete_authenticated"
on public.member_trophies
for delete
to authenticated
using (true);
