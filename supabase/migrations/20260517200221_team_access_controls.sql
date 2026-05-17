-- Team and access controls: active users, safer role updates, and audit-backed
-- assignment management for manager-to-artist access.

alter table public.users
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz default now();

alter table public.artist_assignments
  add column if not exists id uuid not null default uuid_generate_v4();

create unique index if not exists idx_artist_assignments_id
  on public.artist_assignments(id);

update public.users
set is_active = true
where is_active is distinct from true;

create or replace function app_private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.users
  where id = (select auth.uid())
    and is_active = true;
$$;

create or replace function public.enforce_user_admin_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other_active_admins integer;
begin
  if old.id = (select auth.uid()) and old.is_active = true and new.is_active = false then
    raise exception 'You cannot deactivate your own account';
  end if;

  if old.role = 'admin' and (new.role is distinct from 'admin' or new.is_active = false) then
    select count(*)
      into v_other_active_admins
    from public.users
    where id <> old.id
      and role = 'admin'
      and is_active = true;

    if v_other_active_admins = 0 then
      raise exception 'At least one active admin is required';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists enforce_user_admin_safety on public.users;
create trigger enforce_user_admin_safety
before update on public.users
for each row execute function public.enforce_user_admin_safety();

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
before update on public.users
for each row execute function public.update_updated_at();

drop trigger if exists audit_users on public.users;
create trigger audit_users
after insert or update or delete on public.users
for each row execute function public.log_audit_event();

drop trigger if exists audit_artist_assignments on public.artist_assignments;
create trigger audit_artist_assignments
after insert or update or delete on public.artist_assignments
for each row execute function public.log_audit_event();

drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using ((select app_private.current_user_role()) = 'admin')
  with check ((select app_private.current_user_role()) = 'admin');

revoke execute on function public.enforce_user_admin_safety() from anon, authenticated, public;
