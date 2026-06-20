-- SMAJ Ecosystem application form policies
-- Run this in Supabase Dashboard -> SQL Editor.

-- 1. Allow public website users to create application rows.
alter table public.applications enable row level security;

drop policy if exists "Allow public application inserts" on public.applications;

create policy "Allow public application inserts"
on public.applications
for insert
to anon
with check (true);

-- 2. Allow public website users to upload files to the applicatoins bucket.
-- Keep the bucket name as "applicatoins" because that is the bucket name currently used by the site.
drop policy if exists "Allow public application file uploads" on storage.objects;

create policy "Allow public application file uploads"
on storage.objects
for insert
to anon
with check (bucket_id = 'applicatoins');

