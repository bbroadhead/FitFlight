create table if not exists public.app_notifications (
  id text primary key,
  sender_member_id text not null,
  sender_email text not null,
  sender_name text not null,
  recipient_member_id text null,
  recipient_email text not null,
  squadron text not null,
  type text not null,
  title text not null,
  message text not null,
  action_type text null,
  action_target_id text null,
  action_payload jsonb null default '{}'::jsonb,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_notifications_recipient_email
  on public.app_notifications(recipient_email, created_at desc);

create index if not exists idx_app_notifications_squadron
  on public.app_notifications(squadron, created_at desc);

alter table public.app_notifications enable row level security;

drop policy if exists "app_notifications_select_recipient" on public.app_notifications;
create policy "app_notifications_select_recipient"
on public.app_notifications
for select
to authenticated
using (
  lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "app_notifications_insert_authenticated_sender" on public.app_notifications;
create policy "app_notifications_insert_authenticated_sender"
on public.app_notifications
for insert
to authenticated
with check (
  lower(sender_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "app_notifications_update_recipient" on public.app_notifications;
create policy "app_notifications_update_recipient"
on public.app_notifications
for update
to authenticated
using (
  lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
