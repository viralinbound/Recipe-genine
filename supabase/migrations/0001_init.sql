-- CookPilot initial schema
-- Run via: supabase db push  (or paste into Supabase SQL editor)

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- recipes
-- ─────────────────────────────────────────────
create table if not exists public.recipes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  prep_time int,
  cook_time int,
  servings int,
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  cuisine text,
  hero_image text,
  source_url text,
  source_type text check (source_type in ('youtube', 'instagram', 'blog', 'manual')),
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  chef_notes text,
  tips text[],
  raw_transcript text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipes_user_id_idx on public.recipes(user_id);
create index if not exists recipes_created_at_idx on public.recipes(created_at desc);

alter table public.recipes enable row level security;

create policy "Users can view own recipes"
  on public.recipes for select
  using (auth.uid() = user_id);

create policy "Users can insert own recipes"
  on public.recipes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own recipes"
  on public.recipes for update
  using (auth.uid() = user_id);

create policy "Users can delete own recipes"
  on public.recipes for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute procedure public.set_updated_at();

-- ─────────────────────────────────────────────
-- collections
-- ─────────────────────────────────────────────
create table if not exists public.collections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '📁',
  created_at timestamptz not null default now()
);

alter table public.collections enable row level security;

create policy "Users can view own collections"
  on public.collections for select
  using (auth.uid() = user_id);

create policy "Users can insert own collections"
  on public.collections for insert
  with check (auth.uid() = user_id);

create policy "Users can update own collections"
  on public.collections for update
  using (auth.uid() = user_id);

create policy "Users can delete own collections"
  on public.collections for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- recipe_collections (join table)
-- ─────────────────────────────────────────────
create table if not exists public.recipe_collections (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  primary key (recipe_id, collection_id)
);

alter table public.recipe_collections enable row level security;

create policy "Users can view own recipe_collections"
  on public.recipe_collections for select
  using (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
  );

create policy "Users can insert own recipe_collections"
  on public.recipe_collections for insert
  with check (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
  );

create policy "Users can delete own recipe_collections"
  on public.recipe_collections for delete
  using (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- storage: avatars bucket
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
