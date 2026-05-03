-- Phase 2 hardening and workflow helpers for Ria Music Management.

create extension if not exists "uuid-ossp" with schema extensions;

insert into storage.buckets (id, name, public)
values ('project-assets', 'project-assets', false)
on conflict (id) do nothing;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.users where id = (select auth.uid());
$$;

create or replace function public.user_assigned_to_artist(p_artist_id uuid)
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

create or replace function public.user_can_access_artist(p_artist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.current_user_role() in ('admin', 'finance')),
    false
  )
  or coalesce((select public.user_assigned_to_artist(p_artist_id)), false)
  or exists (
    select 1
    from public.artists a
    where a.id = p_artist_id
      and a.manager_id = (select auth.uid())
  );
$$;

create or replace function public.user_can_access_project(p_project_id uuid)
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
      and public.user_can_access_artist(p.artist_id)
  );
$$;

create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := lower(coalesce(new.raw_user_meta_data->>'role', 'manager'));
  if v_role not in ('admin', 'manager', 'finance') then
    v_role := 'manager';
  end if;

  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.users.full_name, excluded.full_name),
        role = coalesce(public.users.role, excluded.role);

  return new;
end;
$$;

create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_record_id uuid;
begin
  begin
    v_user_id := auth.uid();
  exception when others then
    v_user_id := null;
  end;

  if tg_op = 'DELETE' then
    v_record_id := (old.id)::uuid;
    insert into public.audit_log (user_id, action, table_name, record_id, old_data, new_data)
    values (v_user_id, 'DELETE', tg_table_name, v_record_id, to_jsonb(old), null);
    return old;
  elsif tg_op = 'UPDATE' then
    v_record_id := (new.id)::uuid;
    insert into public.audit_log (user_id, action, table_name, record_id, old_data, new_data)
    values (v_user_id, 'UPDATE', tg_table_name, v_record_id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'INSERT' then
    v_record_id := (new.id)::uuid;
    insert into public.audit_log (user_id, action, table_name, record_id, old_data, new_data)
    values (v_user_id, 'INSERT', tg_table_name, v_record_id, null, to_jsonb(new));
    return new;
  end if;

  return null;
end;
$$;

create or replace function public.create_release_checklist(p_project_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.project_checklists where project_id = p_project_id) then
    return;
  end if;

  insert into public.project_checklists (project_id, group_name, item_name, required, has_deliverable, assignee_role, approver_role, due_offset_days, position)
  values
  (p_project_id, 'Pre-Production', 'Brief & Concept Approval', true, true, 'A&R', 'GM', -42, 0),
  (p_project_id, 'Pre-Production', 'Recording Session Booked', true, true, 'Studio Manager', 'A&R', -35, 1),
  (p_project_id, 'Pre-Production', 'Recording Complete', true, false, 'A&R', null, -21, 2),
  (p_project_id, 'Production', 'Rough Mix Delivered', true, true, 'Producer', 'A&R', -18, 3),
  (p_project_id, 'Production', 'Final Mix Approved', true, true, 'A&R', 'GM', -14, 4),
  (p_project_id, 'Production', 'Mastering Complete', true, true, 'Mastering Engineer', 'A&R', -10, 5),
  (p_project_id, 'Production', 'Final Master WAV Delivered', true, true, 'A&R', 'Admin', -7, 6),
  (p_project_id, 'Legal & Admin', 'Split Sheets Signed', true, true, 'A&R', 'Legal', -14, 7),
  (p_project_id, 'Legal & Admin', 'Publishing Registration', true, true, 'Legal', 'GM', -10, 8),
  (p_project_id, 'Artwork & Assets', 'Front Cover Artwork (3000x3000 300dpi)', true, true, 'Designer', 'A&R', -14, 9),
  (p_project_id, 'Artwork & Assets', 'Back Cover & Spine', false, true, 'Designer', 'A&R', -12, 10),
  (p_project_id, 'Artwork & Assets', 'Artist Bio Updated', true, true, 'Marketing', 'A&R', -10, 11),
  (p_project_id, 'Metadata', 'Metadata Sheet Complete (ISRC, BPM, Key, Genre)', true, true, 'A&R', 'Admin', -10, 12),
  (p_project_id, 'Metadata', 'Lyrics Proofread & Approved', true, true, 'Artist', 'A&R', -10, 13),
  (p_project_id, 'Distribution', 'Distributor Account Ready', true, true, 'Admin', 'GM', -7, 14),
  (p_project_id, 'Distribution', 'Distribution Submission', true, true, 'Admin', 'GM', -5, 15),
  (p_project_id, 'Marketing', 'Pre-Save Link Created', true, true, 'Marketing', 'A&R', -14, 16),
  (p_project_id, 'Marketing', 'Social Media Content Calendar', true, true, 'Marketing', 'GM', -10, 17),
  (p_project_id, 'Marketing', 'Press Release Written', true, true, 'Marketing', 'GM', -7, 18),
  (p_project_id, 'Marketing', 'Playlist Pitching Submitted', true, true, 'Marketing', 'A&R', -5, 19),
  (p_project_id, 'Marketing', 'Music Video / Visualizer', false, true, 'Video Director', 'Marketing', -3, 20),
  (p_project_id, 'Post-Release', 'Release Day Checklist Complete', true, false, 'Marketing', null, 0, 21),
  (p_project_id, 'Post-Release', 'Post-Release Performance Report', true, true, 'Marketing', 'GM', 14, 22);
end;
$$;

create or replace function public.project_progress(p_project_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with active_items as (
    select pc.id
    from public.project_checklists pc
    where pc.project_id = p_project_id
      and pc.archived_at is null
  ),
  totals as (
    select
      count(*)::numeric as total,
      count(*) filter (
        where coalesce(cc.approval_status, 'pending') = 'approved'
           or cc.completed_at is not null
      )::numeric as done
    from active_items ai
    left join public.checklist_completions cc on cc.checklist_id = ai.id
  )
  select case when total = 0 then 0 else round((done / total) * 100, 0) end
  from totals;
$$;

create or replace function public.ensure_release_checklist()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'release' then
    perform public.create_release_checklist(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists projects_release_checklist on public.projects;
create trigger projects_release_checklist
after insert on public.projects
for each row execute function public.ensure_release_checklist();

create or replace function public.enforce_project_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    if exists (
      select 1
      from public.project_checklists pc
      left join public.checklist_completions cc on cc.checklist_id = pc.id
      where pc.project_id = new.id
        and pc.archived_at is null
        and pc.required = true
        and coalesce(cc.approval_status, 'pending') <> 'approved'
    ) then
      raise exception 'Required checklist items must be approved before completion';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_completion_guard on public.projects;
create trigger projects_completion_guard
before update of status on public.projects
for each row execute function public.enforce_project_completion();

create or replace function public.enforce_checklist_dependency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_depends_on uuid;
  v_status text;
begin
  if new.approval_status in ('submitted', 'approved') then
    select depends_on into v_depends_on
    from public.project_checklists
    where id = new.checklist_id;

    if v_depends_on is not null then
      select approval_status into v_status
      from public.checklist_completions
      where checklist_id = v_depends_on;

      if coalesce(v_status, 'pending') <> 'approved' then
        raise exception 'Dependent checklist item must be approved first';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists checklist_dependency_guard on public.checklist_completions;
create trigger checklist_dependency_guard
before insert or update of approval_status on public.checklist_completions
for each row execute function public.enforce_checklist_dependency();

create or replace function public.notify_checklist_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checklist public.project_checklists%rowtype;
  v_project public.projects%rowtype;
  v_title text;
  v_message text;
begin
  select * into v_checklist from public.project_checklists where id = new.checklist_id;
  select * into v_project from public.projects where id = v_checklist.project_id;

  if tg_op = 'INSERT' or old.approval_status is distinct from new.approval_status then
    if new.approval_status = 'submitted' then
      v_title := 'Checklist approval requested';
      v_message := v_checklist.item_name || ' is ready for approval on ' || v_project.title;
    elsif new.approval_status = 'approved' then
      v_title := 'Checklist item approved';
      v_message := v_checklist.item_name || ' was approved on ' || v_project.title;
    elsif new.approval_status = 'rejected' then
      v_title := 'Checklist item rejected';
      v_message := v_checklist.item_name || ' needs changes on ' || v_project.title;
    else
      return new;
    end if;

    if v_checklist.assigned_to is not null then
      insert into public.notifications (user_id, type, title, message, link)
      values (v_checklist.assigned_to, 'checklist', v_title, v_message, '/projects/' || v_project.id::text);
    end if;

    if new.approver_id is not null then
      insert into public.notifications (user_id, type, title, message, link)
      values (new.approver_id, 'checklist', v_title, v_message, '/projects/' || v_project.id::text);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists checklist_completion_notifications on public.checklist_completions;
create trigger checklist_completion_notifications
after insert or update of approval_status on public.checklist_completions
for each row execute function public.notify_checklist_change();

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    insert into public.notifications (user_id, type, title, message, link)
    values (new.assigned_to, 'task', 'Task assigned', new.title, '/tasks');
  end if;
  return new;
end;
$$;

drop trigger if exists task_assignment_notifications on public.tasks;
create trigger task_assignment_notifications
after insert or update of assigned_to on public.tasks
for each row execute function public.notify_task_assignment();

create index if not exists idx_artists_created_by on public.artists(created_by);
create index if not exists idx_artists_manager_id on public.artists(manager_id);
create index if not exists idx_projects_created_by on public.projects(created_by);
create index if not exists idx_projects_artist_id on public.projects(artist_id);
create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_projects_target_date on public.projects(target_date);
create index if not exists idx_checklists_project_id on public.project_checklists(project_id);
create index if not exists idx_checklists_assigned_to on public.project_checklists(assigned_to);
create index if not exists idx_checklists_depends_on on public.project_checklists(depends_on);
create index if not exists idx_checklists_archived_at on public.project_checklists(archived_at);
create index if not exists idx_completions_checklist_id on public.checklist_completions(checklist_id);
create index if not exists idx_completions_completed_by on public.checklist_completions(completed_by);
create index if not exists idx_completions_approver_id on public.checklist_completions(approver_id);
create index if not exists idx_completions_approval_status on public.checklist_completions(approval_status);
create index if not exists idx_tasks_project_id on public.tasks(project_id);
create index if not exists idx_tasks_assigned_to on public.tasks(assigned_to);
create index if not exists idx_tasks_created_by on public.tasks(created_by);
create index if not exists idx_tasks_due_date on public.tasks(due_date);
create index if not exists idx_transactions_project_id on public.transactions(project_id);
create index if not exists idx_transactions_artist_id on public.transactions(artist_id);
create index if not exists idx_transactions_created_by on public.transactions(created_by);
create index if not exists idx_transactions_date on public.transactions(date);
create index if not exists idx_transactions_type on public.transactions(type);
create index if not exists idx_contracts_project_id on public.contracts(project_id);
create index if not exists idx_bookings_artist_id on public.bookings(artist_id);
create index if not exists idx_bookings_project_id on public.bookings(project_id);
create index if not exists idx_bookings_created_by on public.bookings(created_by);
create index if not exists idx_bookings_date on public.bookings(date);
create index if not exists idx_bookings_status on public.bookings(status);

drop policy if exists artists_read on public.artists;
drop policy if exists artists_insert on public.artists;
drop policy if exists artists_update on public.artists;
drop policy if exists artists_delete on public.artists;
create policy artists_read on public.artists for select to authenticated
  using (public.user_can_access_artist(id));
create policy artists_insert on public.artists for insert to authenticated
  with check ((select public.current_user_role()) in ('admin', 'manager'));
create policy artists_update on public.artists for update to authenticated
  using ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(id)))
  with check ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(id)));
create policy artists_delete on public.artists for delete to authenticated
  using ((select public.current_user_role()) = 'admin');

drop policy if exists assignments_read on public.artist_assignments;
drop policy if exists assignments_insert on public.artist_assignments;
drop policy if exists assignments_delete on public.artist_assignments;
create policy assignments_read on public.artist_assignments for select to authenticated
  using ((select public.current_user_role()) in ('admin', 'finance') or user_id = (select auth.uid()));
create policy assignments_insert on public.artist_assignments for insert to authenticated
  with check ((select public.current_user_role()) = 'admin');
create policy assignments_delete on public.artist_assignments for delete to authenticated
  using ((select public.current_user_role()) = 'admin');

drop policy if exists projects_read on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
create policy projects_read on public.projects for select to authenticated
  using (public.user_can_access_artist(artist_id));
create policy projects_insert on public.projects for insert to authenticated
  with check ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(artist_id)));
create policy projects_update on public.projects for update to authenticated
  using ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(artist_id)))
  with check ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(artist_id)));
create policy projects_delete on public.projects for delete to authenticated
  using ((select public.current_user_role()) = 'admin');

drop policy if exists checklists_read on public.project_checklists;
drop policy if exists checklists_insert on public.project_checklists;
drop policy if exists checklists_update on public.project_checklists;
drop policy if exists checklists_delete on public.project_checklists;
create policy checklists_read on public.project_checklists for select to authenticated
  using (public.user_can_access_project(project_id));
create policy checklists_insert on public.project_checklists for insert to authenticated
  with check ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_project(project_id)));
create policy checklists_update on public.project_checklists for update to authenticated
  using ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_project(project_id)))
  with check ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_project(project_id)));
create policy checklists_delete on public.project_checklists for delete to authenticated
  using ((select public.current_user_role()) = 'admin');

drop policy if exists completions_read on public.checklist_completions;
drop policy if exists completions_insert on public.checklist_completions;
drop policy if exists completions_update on public.checklist_completions;
create policy completions_read on public.checklist_completions for select to authenticated
  using (exists (select 1 from public.project_checklists pc where pc.id = checklist_id and public.user_can_access_project(pc.project_id)));
create policy completions_insert on public.checklist_completions for insert to authenticated
  with check (exists (select 1 from public.project_checklists pc where pc.id = checklist_id and public.user_can_access_project(pc.project_id)));
create policy completions_update on public.checklist_completions for update to authenticated
  using (exists (select 1 from public.project_checklists pc where pc.id = checklist_id and public.user_can_access_project(pc.project_id)))
  with check (exists (select 1 from public.project_checklists pc where pc.id = checklist_id and public.user_can_access_project(pc.project_id)));

drop policy if exists bookings_read on public.bookings;
drop policy if exists bookings_insert on public.bookings;
drop policy if exists bookings_update on public.bookings;
drop policy if exists bookings_delete on public.bookings;
create policy bookings_read on public.bookings for select to authenticated
  using (public.user_can_access_artist(artist_id));
create policy bookings_insert on public.bookings for insert to authenticated
  with check ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(artist_id)));
create policy bookings_update on public.bookings for update to authenticated
  using ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(artist_id)))
  with check ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(artist_id)));
create policy bookings_delete on public.bookings for delete to authenticated
  using ((select public.current_user_role()) = 'admin');

drop policy if exists tasks_read on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (
    (select public.current_user_role()) in ('admin', 'finance')
    or assigned_to = (select auth.uid())
    or created_by = (select auth.uid())
    or (artist_id is not null and public.user_can_access_artist(artist_id))
    or (project_id is not null and public.user_can_access_project(project_id))
  );
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    (select public.current_user_role()) = 'admin'
    or (
      (select public.current_user_role()) = 'manager'
      and (
        artist_id is null
        or public.user_can_access_artist(artist_id)
        or (project_id is not null and public.user_can_access_project(project_id))
      )
    )
  );
create policy tasks_update on public.tasks for update to authenticated
  using (
    (select public.current_user_role()) = 'admin'
    or assigned_to = (select auth.uid())
    or (
      (select public.current_user_role()) = 'manager'
      and (
        created_by = (select auth.uid())
        or (artist_id is not null and public.user_can_access_artist(artist_id))
        or (project_id is not null and public.user_can_access_project(project_id))
      )
    )
  )
  with check (
    (select public.current_user_role()) = 'admin'
    or assigned_to = (select auth.uid())
    or (
      (select public.current_user_role()) = 'manager'
      and (
        created_by = (select auth.uid())
        or (artist_id is not null and public.user_can_access_artist(artist_id))
        or (project_id is not null and public.user_can_access_project(project_id))
      )
    )
  );
create policy tasks_delete on public.tasks for delete to authenticated
  using ((select public.current_user_role()) = 'admin');

drop policy if exists transactions_read on public.transactions;
drop policy if exists transactions_insert on public.transactions;
drop policy if exists transactions_update on public.transactions;
drop policy if exists transactions_delete on public.transactions;
create policy transactions_read on public.transactions for select to authenticated
  using ((select public.current_user_role()) in ('admin', 'finance') or public.user_can_access_artist(artist_id));
create policy transactions_insert on public.transactions for insert to authenticated
  with check ((select public.current_user_role()) in ('admin', 'finance') or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(artist_id)));
create policy transactions_update on public.transactions for update to authenticated
  using ((select public.current_user_role()) in ('admin', 'finance') or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(artist_id)))
  with check ((select public.current_user_role()) in ('admin', 'finance') or ((select public.current_user_role()) = 'manager' and public.user_can_access_artist(artist_id)));
create policy transactions_delete on public.transactions for delete to authenticated
  using ((select public.current_user_role()) = 'admin');

drop policy if exists contracts_read on public.contracts;
drop policy if exists contracts_insert on public.contracts;
drop policy if exists contracts_delete on public.contracts;
create policy contracts_read on public.contracts for select to authenticated
  using (artist_id is not null and public.user_can_access_artist(artist_id));
create policy contracts_insert on public.contracts for insert to authenticated
  with check ((select public.current_user_role()) = 'admin' or ((select public.current_user_role()) = 'manager' and artist_id is not null and public.user_can_access_artist(artist_id)));
create policy contracts_delete on public.contracts for delete to authenticated
  using ((select public.current_user_role()) = 'admin');

drop policy if exists storage_project_assets_admin_finance_read on storage.objects;
drop policy if exists storage_project_assets_manager_read on storage.objects;
drop policy if exists storage_project_assets_upload on storage.objects;
drop policy if exists storage_project_assets_delete on storage.objects;
create policy storage_project_assets_admin_finance_read on storage.objects for select to authenticated
  using (
    bucket_id = 'project-assets'
    and (select public.current_user_role()) in ('admin', 'finance')
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
      (select public.current_user_role()) = 'admin'
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
    and (select public.current_user_role()) = 'admin'
  );

revoke execute on function public.current_user_role() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.log_audit_event() from anon, authenticated, public;
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
revoke execute on function public.user_assigned_to_artist(uuid) from anon, authenticated, public;
revoke execute on function public.user_can_access_artist(uuid) from anon, authenticated, public;
revoke execute on function public.user_can_access_project(uuid) from anon, authenticated, public;
revoke execute on function public.notify_checklist_change() from anon, authenticated, public;
revoke execute on function public.notify_task_assignment() from anon, authenticated, public;
revoke execute on function public.enforce_project_completion() from anon, authenticated, public;
revoke execute on function public.enforce_checklist_dependency() from anon, authenticated, public;
revoke execute on function public.ensure_release_checklist() from anon, authenticated, public;
