create table if not exists public.support_threads (
  id text primary key,
  requester_member_id text not null,
  requester_email text not null unique,
  requester_name text not null,
  requester_squadron text not null,
  subject text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id text primary key,
  thread_id text not null references public.support_threads(id) on delete cascade,
  sender_member_id text not null,
  sender_email text not null,
  sender_name text not null,
  subject text,
  body text not null,
  is_from_owner boolean not null default false,
  created_at timestamptz not null default now(),
  read_by_owner boolean not null default false,
  read_by_requester boolean not null default false
);

drop trigger if exists support_threads_set_updated_at on public.support_threads;
create trigger support_threads_set_updated_at
before update on public.support_threads
for each row
execute function public.set_updated_at();

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "support_threads_select_owner_or_requester" on public.support_threads;
create policy "support_threads_select_owner_or_requester"
on public.support_threads
for select
to authenticated
using (
  public.current_member_role() = 'fitflight_creator'
  or lower(requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "support_threads_insert_requester" on public.support_threads;
create policy "support_threads_insert_requester"
on public.support_threads
for insert
to authenticated
with check (
  lower(requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "support_threads_update_owner_or_requester" on public.support_threads;
create policy "support_threads_update_owner_or_requester"
on public.support_threads
for update
to authenticated
using (
  public.current_member_role() = 'fitflight_creator'
  or lower(requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  public.current_member_role() = 'fitflight_creator'
  or lower(requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "support_messages_select_owner_or_requester" on public.support_messages;
create policy "support_messages_select_owner_or_requester"
on public.support_messages
for select
to authenticated
using (
  public.current_member_role() = 'fitflight_creator'
  or exists (
    select 1
    from public.support_threads st
    where st.id = support_messages.thread_id
      and lower(st.requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "support_messages_insert_owner_or_requester" on public.support_messages;
create policy "support_messages_insert_owner_or_requester"
on public.support_messages
for insert
to authenticated
with check (
  (
    public.current_member_role() = 'fitflight_creator'
    and is_from_owner = true
  )
  or exists (
    select 1
    from public.support_threads st
    where st.id = support_messages.thread_id
      and lower(st.requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and support_messages.is_from_owner = false
  )
);

drop policy if exists "support_messages_update_owner_or_requester" on public.support_messages;
create policy "support_messages_update_owner_or_requester"
on public.support_messages
for update
to authenticated
using (
  public.current_member_role() = 'fitflight_creator'
  or exists (
    select 1
    from public.support_threads st
    where st.id = support_messages.thread_id
      and lower(st.requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
)
with check (
  (
    public.current_member_role() = 'fitflight_creator'
    and sender_member_id = support_messages.sender_member_id
    and sender_email = support_messages.sender_email
    and sender_name = support_messages.sender_name
    and subject is not distinct from support_messages.subject
    and body = support_messages.body
    and is_from_owner = support_messages.is_from_owner
    and created_at = support_messages.created_at
  )
  or (
    exists (
      select 1
      from public.support_threads st
      where st.id = support_messages.thread_id
        and lower(st.requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and sender_member_id = support_messages.sender_member_id
    and sender_email = support_messages.sender_email
    and sender_name = support_messages.sender_name
    and subject is not distinct from support_messages.subject
    and body = support_messages.body
    and is_from_owner = support_messages.is_from_owner
    and created_at = support_messages.created_at
  )
);
