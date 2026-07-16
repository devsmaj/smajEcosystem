create extension if not exists pgcrypto;

create table if not exists public.team_members (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    full_name text not null,
    job_title text not null,
    biography text not null,
    photo_url text,
    photo_path text,
    email text,
    skills text[] not null default '{}',
    social_links jsonb not null default '{}'::jsonb,
    display_order integer not null default 0 check (display_order >= 0),
    is_published boolean not null default false,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint team_members_social_links_object check (jsonb_typeof(social_links) = 'object')
);

create index if not exists team_members_public_order_idx
on public.team_members (is_published, display_order, full_name);

alter table public.team_members enable row level security;

create or replace function public.is_smaj_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.admin_users
        where user_id = auth.uid()
    );
$$;

grant execute on function public.is_smaj_admin() to authenticated;

drop policy if exists "Public can view published team members" on public.team_members;
create policy "Public can view published team members"
on public.team_members for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Admins can view all team members" on public.team_members;
create policy "Admins can view all team members"
on public.team_members for select
to authenticated
using (public.is_smaj_admin());

drop policy if exists "Admins can insert team members" on public.team_members;
create policy "Admins can insert team members"
on public.team_members for insert
to authenticated
with check (public.is_smaj_admin() and created_by = auth.uid());

drop policy if exists "Admins can update team members" on public.team_members;
create policy "Admins can update team members"
on public.team_members for update
to authenticated
using (public.is_smaj_admin())
with check (public.is_smaj_admin());

drop policy if exists "Admins can delete team members" on public.team_members;
create policy "Admins can delete team members"
on public.team_members for delete
to authenticated
using (public.is_smaj_admin());

grant select on public.team_members to anon, authenticated;
grant insert, update, delete on public.team_members to authenticated;

create or replace function public.set_team_member_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_team_member_updated_at on public.team_members;
create trigger set_team_member_updated_at
before update on public.team_members
for each row execute function public.set_team_member_updated_at();

insert into storage.buckets (id, name, public)
values ('team-photos', 'team-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Team photos are public" on storage.objects;
create policy "Team photos are public"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'team-photos');

drop policy if exists "Admins can upload team photos" on storage.objects;
create policy "Admins can upload team photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'team-photos' and public.is_smaj_admin());

drop policy if exists "Admins can update team photos" on storage.objects;
create policy "Admins can update team photos"
on storage.objects for update
to authenticated
using (bucket_id = 'team-photos' and public.is_smaj_admin())
with check (bucket_id = 'team-photos' and public.is_smaj_admin());

drop policy if exists "Admins can delete team photos" on storage.objects;
create policy "Admins can delete team photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'team-photos' and public.is_smaj_admin());

insert into public.team_members (
    slug, full_name, job_title, biography, photo_url, email, skills,
    social_links, display_order, is_published
)
values
(
    'saleh-mala-ajimi',
    'Saleh Mala Ajimi',
    'Founder & CEO — SMAJ Ecosystem',
    'Building the vision, technology, and foundation behind SMAJ Ecosystem. Focused on creating, partnering, and scaling future technology companies.',
    '/assets/images/ceo.jpg',
    null,
    '{}',
    '{"linkedin":"https://www.linkedin.com/in/salehmalaajimi","github":"https://github.com/devsmaj","x":"https://x.com/smajceo"}'::jsonb,
    1,
    true
),
(
    'umar-alhaji-mala',
    'Umar Alhaji Mala',
    'Social Media Manager | AI Content Creator | Digital Marketing Assistant',
    'Umar Alhaji Mala supports SMAJ Ecosystem''s online presence, community growth, and digital branding through social media content, captions, reels, short videos, graphics, and campaign ideas. He also uses AI tools and assistants to improve marketing strategy and audience engagement.',
    null,
    'umaralhajimala3@gmail.com',
    array['Social media management','AI content creation','Digital marketing support','Community growth','Reels, shorts, captions, and graphics','Canva, CapCut, ChatGPT, AI tools'],
    '{"facebook":"https://www.facebook.com/profile.php?id=100085495805073","instagram":"https://www.instagram.com/umaralhajimala3?igsh=eGI4YXVwNmt0eTZx","telegram":"https://t.me/Ralm89","tiktok":"https://tiktok.com/@u.a.m.special","youtube":"https://youtube.com/@umaralhajimala2022?si=I7ACNZUrvaRpRdSi"}'::jsonb,
    2,
    true
)
on conflict (slug) do nothing;
