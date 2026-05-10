-- Move RLS helper functions out of the exposed public API schema and tighten
-- private bucket uploads by artist folder ownership.

create schema if not exists app_private;

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.users where id = (select auth.uid());
$$;

create or replace function app_private.user_assigned_to_artist(p_artist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.artist_assignments
    where artist_id = p_artist_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function app_private.user_can_access_artist(p_artist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app_private.current_user_role() in ('admin', 'finance')),
    false
  )
  or coalesce((select app_private.user_assigned_to_artist(p_artist_id)), false)
  or exists (
    select 1
    from public.artists a
    where a.id = p_artist_id
      and a.manager_id = (select auth.uid())
  );
$$;

create or replace function app_private.user_can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and app_private.user_can_access_artist(p.artist_id)
  );
$$;

revoke all on function app_private.current_user_role() from public, anon;
revoke all on function app_private.user_assigned_to_artist(uuid) from public, anon;
revoke all on function app_private.user_can_access_artist(uuid) from public, anon;
revoke all on function app_private.user_can_access_project(uuid) from public, anon;
grant execute on function app_private.current_user_role() to authenticated, service_role;
grant execute on function app_private.user_assigned_to_artist(uuid) to authenticated, service_role;
grant execute on function app_private.user_can_access_artist(uuid) to authenticated, service_role;
grant execute on function app_private.user_can_access_project(uuid) to authenticated, service_role;

drop policy if exists artists_read on public.artists;
drop policy if exists artists_insert on public.artists;
drop policy if exists artists_update on public.artists;
drop policy if exists artists_delete on public.artists;
create policy artists_read on public.artists for select to authenticated
  using (app_private.user_can_access_artist(id));
create policy artists_insert on public.artists for insert to authenticated
  with check ((select app_private.current_user_role()) in ('admin', 'manager'));
create policy artists_update on public.artists for update to authenticated
  using ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(id)))
  with check ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(id)));
create policy artists_delete on public.artists for delete to authenticated
  using ((select app_private.current_user_role()) = 'admin');

drop policy if exists assignments_read on public.artist_assignments;
drop policy if exists assignments_insert on public.artist_assignments;
drop policy if exists assignments_delete on public.artist_assignments;
create policy assignments_read on public.artist_assignments for select to authenticated
  using ((select app_private.current_user_role()) in ('admin', 'finance') or user_id = (select auth.uid()));
create policy assignments_insert on public.artist_assignments for insert to authenticated
  with check ((select app_private.current_user_role()) = 'admin');
create policy assignments_delete on public.artist_assignments for delete to authenticated
  using ((select app_private.current_user_role()) = 'admin');

drop policy if exists projects_read on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
create policy projects_read on public.projects for select to authenticated
  using (app_private.user_can_access_artist(artist_id));
create policy projects_insert on public.projects for insert to authenticated
  with check ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(artist_id)));
create policy projects_update on public.projects for update to authenticated
  using ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(artist_id)))
  with check ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(artist_id)));
create policy projects_delete on public.projects for delete to authenticated
  using ((select app_private.current_user_role()) = 'admin');

drop policy if exists checklists_read on public.project_checklists;
drop policy if exists checklists_insert on public.project_checklists;
drop policy if exists checklists_update on public.project_checklists;
drop policy if exists checklists_delete on public.project_checklists;
create policy checklists_read on public.project_checklists for select to authenticated
  using (app_private.user_can_access_project(project_id));
create policy checklists_insert on public.project_checklists for insert to authenticated
  with check ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_project(project_id)));
create policy checklists_update on public.project_checklists for update to authenticated
  using ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_project(project_id)))
  with check ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_project(project_id)));
create policy checklists_delete on public.project_checklists for delete to authenticated
  using ((select app_private.current_user_role()) = 'admin');

drop policy if exists completions_read on public.checklist_completions;
drop policy if exists completions_insert on public.checklist_completions;
drop policy if exists completions_update on public.checklist_completions;
create policy completions_read on public.checklist_completions for select to authenticated
  using (exists (select 1 from public.project_checklists pc where pc.id = checklist_id and app_private.user_can_access_project(pc.project_id)));
create policy completions_insert on public.checklist_completions for insert to authenticated
  with check (exists (select 1 from public.project_checklists pc where pc.id = checklist_id and app_private.user_can_access_project(pc.project_id)));
create policy completions_update on public.checklist_completions for update to authenticated
  using (exists (select 1 from public.project_checklists pc where pc.id = checklist_id and app_private.user_can_access_project(pc.project_id)))
  with check (exists (select 1 from public.project_checklists pc where pc.id = checklist_id and app_private.user_can_access_project(pc.project_id)));

drop policy if exists bookings_read on public.bookings;
drop policy if exists bookings_insert on public.bookings;
drop policy if exists bookings_update on public.bookings;
drop policy if exists bookings_delete on public.bookings;
create policy bookings_read on public.bookings for select to authenticated
  using (app_private.user_can_access_artist(artist_id));
create policy bookings_insert on public.bookings for insert to authenticated
  with check ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(artist_id)));
create policy bookings_update on public.bookings for update to authenticated
  using ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(artist_id)))
  with check ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(artist_id)));
create policy bookings_delete on public.bookings for delete to authenticated
  using ((select app_private.current_user_role()) = 'admin');

drop policy if exists tasks_read on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (
    (select app_private.current_user_role()) in ('admin', 'finance')
    or assigned_to = (select auth.uid())
    or created_by = (select auth.uid())
    or (artist_id is not null and app_private.user_can_access_artist(artist_id))
    or (project_id is not null and app_private.user_can_access_project(project_id))
  );
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    (select app_private.current_user_role()) = 'admin'
    or (
      (select app_private.current_user_role()) = 'manager'
      and (
        artist_id is null
        or app_private.user_can_access_artist(artist_id)
        or (project_id is not null and app_private.user_can_access_project(project_id))
      )
    )
  );
create policy tasks_update on public.tasks for update to authenticated
  using (
    (select app_private.current_user_role()) = 'admin'
    or assigned_to = (select auth.uid())
    or (
      (select app_private.current_user_role()) = 'manager'
      and (
        created_by = (select auth.uid())
        or (artist_id is not null and app_private.user_can_access_artist(artist_id))
        or (project_id is not null and app_private.user_can_access_project(project_id))
      )
    )
  )
  with check (
    (select app_private.current_user_role()) = 'admin'
    or assigned_to = (select auth.uid())
    or (
      (select app_private.current_user_role()) = 'manager'
      and (
        created_by = (select auth.uid())
        or (artist_id is not null and app_private.user_can_access_artist(artist_id))
        or (project_id is not null and app_private.user_can_access_project(project_id))
      )
    )
  );
create policy tasks_delete on public.tasks for delete to authenticated
  using ((select app_private.current_user_role()) = 'admin');

drop policy if exists transactions_read on public.transactions;
drop policy if exists transactions_insert on public.transactions;
drop policy if exists transactions_update on public.transactions;
drop policy if exists transactions_delete on public.transactions;
create policy transactions_read on public.transactions for select to authenticated
  using ((select app_private.current_user_role()) in ('admin', 'finance') or app_private.user_can_access_artist(artist_id));
create policy transactions_insert on public.transactions for insert to authenticated
  with check ((select app_private.current_user_role()) in ('admin', 'finance') or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(artist_id)));
create policy transactions_update on public.transactions for update to authenticated
  using ((select app_private.current_user_role()) in ('admin', 'finance') or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(artist_id)))
  with check ((select app_private.current_user_role()) in ('admin', 'finance') or ((select app_private.current_user_role()) = 'manager' and app_private.user_can_access_artist(artist_id)));
create policy transactions_delete on public.transactions for delete to authenticated
  using ((select app_private.current_user_role()) = 'admin');

drop policy if exists contracts_read on public.contracts;
drop policy if exists contracts_insert on public.contracts;
drop policy if exists contracts_delete on public.contracts;
create policy contracts_read on public.contracts for select to authenticated
  using (artist_id is not null and app_private.user_can_access_artist(artist_id));
create policy contracts_insert on public.contracts for insert to authenticated
  with check ((select app_private.current_user_role()) = 'admin' or ((select app_private.current_user_role()) = 'manager' and artist_id is not null and app_private.user_can_access_artist(artist_id)));
create policy contracts_delete on public.contracts for delete to authenticated
  using ((select app_private.current_user_role()) = 'admin');

drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using ((select auth.uid()) = id or (select app_private.current_user_role()) = 'admin')
  with check ((select auth.uid()) = id or (select app_private.current_user_role()) = 'admin');

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using ((select app_private.current_user_role()) in ('admin', 'manager'));

drop policy if exists storage_project_assets_admin_finance_read on storage.objects;
drop policy if exists storage_project_assets_manager_read on storage.objects;
drop policy if exists storage_project_assets_upload on storage.objects;
drop policy if exists storage_project_assets_delete on storage.objects;
create policy storage_project_assets_admin_finance_read on storage.objects for select to authenticated
  using (
    bucket_id = 'project-assets'
    and (select app_private.current_user_role()) in ('admin', 'finance')
  );
create policy storage_project_assets_manager_read on storage.objects for select to authenticated
  using (
    bucket_id = 'project-assets'
    and exists (
      select 1
      from public.artist_assignments aa
      where aa.user_id = (select auth.uid())
        and (storage.foldername(name))[1] = aa.artist_id::text
    )
  );
create policy storage_project_assets_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-assets'
    and (
      (select app_private.current_user_role()) = 'admin'
      or exists (
        select 1
        from public.artist_assignments aa
        where aa.user_id = (select auth.uid())
          and (storage.foldername(name))[1] = aa.artist_id::text
      )
    )
  );
create policy storage_project_assets_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-assets'
    and (select app_private.current_user_role()) = 'admin'
  );

drop policy if exists storage_authenticated_upload_any_private_bucket on storage.objects;
create policy storage_private_bucket_upload on storage.objects for insert to authenticated
  with check (
    bucket_id in ('contracts', 'receipts', 'photos')
    and (
      (select app_private.current_user_role()) = 'admin'
      or (bucket_id = 'receipts' and (select app_private.current_user_role()) = 'finance')
      or exists (
        select 1
        from public.artist_assignments aa
        where aa.user_id = (select auth.uid())
          and (storage.foldername(name))[1] = aa.artist_id::text
      )
    )
  );

revoke execute on function public.current_user_role() from anon, authenticated, public;
revoke execute on function public.user_assigned_to_artist(uuid) from anon, authenticated, public;
revoke execute on function public.user_can_access_artist(uuid) from anon, authenticated, public;
revoke execute on function public.user_can_access_project(uuid) from anon, authenticated, public;
