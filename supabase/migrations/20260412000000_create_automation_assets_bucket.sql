-- Create a new storage bucket for automation assets
insert into storage.buckets (id, name, public)
values ('automation-assets', 'automation-assets', true)
on conflict (id) do nothing;

-- Set up RLS policies for the bucket
-- 1. Allow public to read (for DM visibility)
create policy "Public Access"
on storage.objects for select
using ( bucket_id = 'automation-assets' );

-- 2. Allow authenticated users to upload their own files
create policy "Authenticated Upload"
on storage.objects for insert
with check (
  bucket_id = 'automation-assets' 
  and auth.role() = 'authenticated'
);

-- 3. Allow owners to update/delete their own files
create policy "User Update Own Files"
on storage.objects for update
using ( bucket_id = 'automation-assets' and auth.uid() = owner );

create policy "User Delete Own Files"
on storage.objects for delete
using ( bucket_id = 'automation-assets' and auth.uid() = owner );
