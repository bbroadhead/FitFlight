create extension if not exists pgcrypto;

create table if not exists public.app_update_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  note_type text not null check (note_type in ('update', 'hotfix')),
  version_label text null,
  published_by_email text not null,
  published_by_name text not null,
  is_published boolean not null default true,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_update_note_reads (
  note_id uuid not null references public.app_update_notes(id) on delete cascade,
  reader_email text not null,
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (note_id, reader_email)
);

create index if not exists app_update_notes_published_at_idx
on public.app_update_notes (published_at desc);

create index if not exists app_update_note_reads_reader_email_idx
on public.app_update_note_reads (reader_email);

drop trigger if exists app_update_notes_set_updated_at on public.app_update_notes;
create trigger app_update_notes_set_updated_at
before update on public.app_update_notes
for each row
execute function public.set_updated_at();

alter table public.app_update_notes enable row level security;
alter table public.app_update_note_reads enable row level security;

drop policy if exists "app_update_notes_select_authenticated" on public.app_update_notes;
create policy "app_update_notes_select_authenticated"
on public.app_update_notes
for select
to authenticated
using (
  is_published = true
  or public.current_member_role() = 'fitflight_creator'
);

drop policy if exists "app_update_notes_owner_insert" on public.app_update_notes;
create policy "app_update_notes_owner_insert"
on public.app_update_notes
for insert
to authenticated
with check (
  public.current_member_role() = 'fitflight_creator'
);

drop policy if exists "app_update_notes_owner_update" on public.app_update_notes;
create policy "app_update_notes_owner_update"
on public.app_update_notes
for update
to authenticated
using (
  public.current_member_role() = 'fitflight_creator'
)
with check (
  public.current_member_role() = 'fitflight_creator'
);

drop policy if exists "app_update_notes_owner_delete" on public.app_update_notes;
create policy "app_update_notes_owner_delete"
on public.app_update_notes
for delete
to authenticated
using (
  public.current_member_role() = 'fitflight_creator'
);

drop policy if exists "app_update_note_reads_select_own_or_owner" on public.app_update_note_reads;
create policy "app_update_note_reads_select_own_or_owner"
on public.app_update_note_reads
for select
to authenticated
using (
  lower(reader_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.current_member_role() = 'fitflight_creator'
);

drop policy if exists "app_update_note_reads_insert_own" on public.app_update_note_reads;
create policy "app_update_note_reads_insert_own"
on public.app_update_note_reads
for insert
to authenticated
with check (
  lower(reader_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
