-- Allow public application submissions without exposing applicant records.
-- Apply with `supabase db push` after linking this repository to its project.

alter table public.application enable row level security;

drop policy if exists "Allow public application submissions"
on public.application;

drop policy if exists "Allow public application inserts"
on public.application;

drop policy if exists "Allow anonymous inserts"
on public.application;

create policy "Allow public application submissions"
on public.application
for insert
to anon, authenticated
with check (true);

grant usage on schema public to anon, authenticated;
grant insert on table public.application to anon, authenticated;

-- Intentionally do not grant SELECT and do not create an anon/authenticated
-- public SELECT policy. Admin SELECT remains governed by its separate policy.
