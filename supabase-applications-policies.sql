-- SMAJ Ecosystem application form policies
-- Run this in Supabase Dashboard -> SQL Editor.

-- 1. Allow public website users to create application rows.
-- IMPORTANT: the table name is public.application (singular).
alter table public.application enable row level security;

drop policy if exists "Allow public application inserts" on public.application;

create policy "Allow public application inserts"
on public.application
for insert
to anon
with check (status = 'pending');

-- 2. Allow public website users to upload files to the applicatoins bucket.
-- Keep the bucket name as "applicatoins" because that is the bucket name currently used by the site.
drop policy if exists "Allow public application file uploads" on storage.objects;

create policy "Allow public application file uploads"
on storage.objects
for insert
to anon
with check (bucket_id = 'applicatoins');

-- Admin dashboard note:
-- The static admin MVP uses the anon key and a client-side password gate only.
-- Do not add broad anon SELECT or UPDATE policies in production, because anyone
-- with the anon key could read or modify application rows outside the UI.
--
-- Production recommendation:
-- 1. Enable Supabase Auth for admin users.
-- 2. Create an admin allowlist table keyed by auth.uid().
-- 3. Add SELECT and UPDATE policies for authenticated admin users only.
--
-- Example shape to adapt after creating public.admin_users(user_id uuid primary key):
--
-- create policy "Allow authenticated admins to read application"
-- on public.application
-- for select
-- to authenticated
-- using (exists (
--     select 1 from public.admin_users
--     where admin_users.user_id = auth.uid()
-- ));
--
-- create policy "Allow authenticated admins to update application"
-- on public.application
-- for update
-- to authenticated
-- using (exists (
--     select 1 from public.admin_users
--     where admin_users.user_id = auth.uid()
-- ))
-- with check (exists (
--     select 1 from public.admin_users
--     where admin_users.user_id = auth.uid()
-- ));
