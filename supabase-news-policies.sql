create extension if not exists pgcrypto;

create table if not exists public.news_articles (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    slug text not null unique,
    excerpt text not null,
    content text not null,
    featured_image text,
    category text not null default 'News',
    tags text[] not null default '{}',
    author text not null default 'SMAJ Team',
    status text not null default 'draft' check (status in ('draft', 'published')),
    seo_title text,
    seo_description text,
    published_at timestamptz,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists news_articles_status_published_idx
    on public.news_articles (status, published_at desc);

create index if not exists news_articles_slug_idx
    on public.news_articles (slug);

alter table public.news_articles enable row level security;

drop policy if exists "Published news is public" on public.news_articles;
create policy "Published news is public"
on public.news_articles
for select
using (status = 'published');

drop policy if exists "Admins can read all news" on public.news_articles;
create policy "Admins can read all news"
on public.news_articles
for select
to authenticated
using (
    exists (
        select 1 from public.admin_users
        where admin_users.user_id = auth.uid()
    )
);

drop policy if exists "Admins can insert news" on public.news_articles;
create policy "Admins can insert news"
on public.news_articles
for insert
to authenticated
with check (
    exists (
        select 1 from public.admin_users
        where admin_users.user_id = auth.uid()
    )
);

drop policy if exists "Admins can update news" on public.news_articles;
create policy "Admins can update news"
on public.news_articles
for update
to authenticated
using (
    exists (
        select 1 from public.admin_users
        where admin_users.user_id = auth.uid()
    )
)
with check (
    exists (
        select 1 from public.admin_users
        where admin_users.user_id = auth.uid()
    )
);

drop policy if exists "Admins can delete news" on public.news_articles;
create policy "Admins can delete news"
on public.news_articles
for delete
to authenticated
using (
    exists (
        select 1 from public.admin_users
        where admin_users.user_id = auth.uid()
    )
);

create or replace function public.set_news_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    if new.status = 'published' and new.published_at is null then
        new.published_at = now();
    end if;
    if new.status = 'draft' then
        new.published_at = null;
    end if;
    return new;
end;
$$;

drop trigger if exists set_news_articles_updated_at on public.news_articles;
create trigger set_news_articles_updated_at
before insert or update on public.news_articles
for each row execute function public.set_news_updated_at();

create or replace view public.news_sitemap as
select
    'https://smaj.org/news/' || slug || '/' as loc,
    coalesce(updated_at, published_at, created_at) as lastmod
from public.news_articles
where status = 'published';

create or replace function public.get_news_sitemap()
returns table (loc text, lastmod timestamptz)
language sql
security definer
set search_path = public
as $$
    select news_sitemap.loc, news_sitemap.lastmod
    from public.news_sitemap
    order by news_sitemap.lastmod desc;
$$;

grant execute on function public.get_news_sitemap() to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('news-images', 'news-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "News images are public" on storage.objects;
create policy "News images are public"
on storage.objects
for select
using (bucket_id = 'news-images');

drop policy if exists "Admins can upload news images" on storage.objects;
create policy "Admins can upload news images"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'news-images'
    and exists (
        select 1 from public.admin_users
        where admin_users.user_id = auth.uid()
    )
);

drop policy if exists "Admins can update news images" on storage.objects;
create policy "Admins can update news images"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'news-images'
    and exists (
        select 1 from public.admin_users
        where admin_users.user_id = auth.uid()
    )
);

drop policy if exists "Admins can delete news images" on storage.objects;
create policy "Admins can delete news images"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'news-images'
    and exists (
        select 1 from public.admin_users
        where admin_users.user_id = auth.uid()
    )
);
