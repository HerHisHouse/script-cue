-- Ensure recordings bucket exists (id and name must match)
insert into storage.buckets (id, name, public)
select 'recordings', 'recordings', false
where not exists (select 1 from storage.buckets where id = 'recordings');

-- Policies for authenticated users scoped to their own folder: {auth.uid()}/...
do $$
begin
  -- SELECT
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recordings_select_own'
  ) then
    create policy recordings_select_own on storage.objects
      for select to authenticated
      using (bucket_id = 'recordings' and name like auth.uid()::text || '/%');
  end if;

  -- INSERT
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recordings_insert_own'
  ) then
    create policy recordings_insert_own on storage.objects
      for insert to authenticated
      with check (bucket_id = 'recordings' and name like auth.uid()::text || '/%');
  end if;

  -- UPDATE (needed for move operations)
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recordings_update_own'
  ) then
    create policy recordings_update_own on storage.objects
      for update to authenticated
      using (bucket_id = 'recordings' and name like auth.uid()::text || '/%')
      with check (bucket_id = 'recordings' and name like auth.uid()::text || '/%');
  end if;

  -- DELETE (needed for move operations; storage service may delete the old key)
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recordings_delete_own'
  ) then
    create policy recordings_delete_own on storage.objects
      for delete to authenticated
      using (bucket_id = 'recordings' and name like auth.uid()::text || '/%');
  end if;
end$$;