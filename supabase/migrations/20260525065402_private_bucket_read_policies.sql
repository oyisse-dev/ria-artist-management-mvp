drop policy if exists storage_private_bucket_admin_read on storage.objects;
drop policy if exists storage_private_bucket_manager_read on storage.objects;
drop policy if exists storage_private_bucket_finance_receipts_read on storage.objects;
drop policy if exists storage_private_bucket_admin_delete on storage.objects;

create policy storage_private_bucket_admin_read on storage.objects for select to authenticated
  using (
    bucket_id in ('contracts', 'receipts', 'photos')
    and (select app_private.current_user_role()) = 'admin'
  );

create policy storage_private_bucket_manager_read on storage.objects for select to authenticated
  using (
    bucket_id in ('contracts', 'receipts', 'photos')
    and exists (
      select 1
      from public.artist_assignments aa
      where aa.user_id = (select auth.uid())
        and (storage.foldername(name))[1] = aa.artist_id::text
    )
  );

create policy storage_private_bucket_finance_receipts_read on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (select app_private.current_user_role()) = 'finance'
  );

create policy storage_private_bucket_admin_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('contracts', 'receipts', 'photos')
    and (select app_private.current_user_role()) = 'admin'
  );
