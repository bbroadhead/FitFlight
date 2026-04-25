create table if not exists public.admin_action_audit (
  id text primary key,
  actor_member_id text null,
  actor_email text not null,
  actor_name text not null,
  actor_role text not null,
  action_type text not null,
  target_member_id text null,
  target_email text null,
  target_name text null,
  squadron text null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_action_audit_created_at_idx
  on public.admin_action_audit (created_at desc);

create index if not exists admin_action_audit_actor_email_idx
  on public.admin_action_audit (lower(actor_email));

alter table public.admin_action_audit enable row level security;

drop policy if exists "admin audit insert authenticated" on public.admin_action_audit;
create policy "admin audit insert authenticated"
on public.admin_action_audit
for insert
to authenticated
with check (true);

drop policy if exists "admin audit owner or ufpm view" on public.admin_action_audit;
drop policy if exists "admin audit owner view" on public.admin_action_audit;
create policy "admin audit owner or ufpm view"
on public.admin_action_audit
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'benjamin.broadhead.2@us.af.mil'
  or exists (
    select 1
    from public.member_roles mr
    where lower(mr.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and mr.app_role = 'ufpm'
  )
);
