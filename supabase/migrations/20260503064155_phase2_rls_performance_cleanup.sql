create index if not exists idx_checklists_archived_by on public.project_checklists(archived_by);

drop policy if exists users_insert on public.users;
drop policy if exists users_update_self on public.users;
drop policy if exists users_update_admin on public.users;
create policy users_insert on public.users for insert to authenticated
  with check ((select auth.uid()) = id);
create policy users_update on public.users for update to authenticated
  using ((select auth.uid()) = id or (select public.current_user_role()) = 'admin')
  with check ((select auth.uid()) = id or (select public.current_user_role()) = 'admin');

drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_update on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
