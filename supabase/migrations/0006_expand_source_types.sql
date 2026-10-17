-- Expand recipes.source_type to support social video platforms used by import-recipe.
alter table public.recipes
  drop constraint if exists recipes_source_type_check;

alter table public.recipes
  add constraint recipes_source_type_check
  check (source_type in ('youtube', 'instagram', 'tiktok', 'facebook', 'blog', 'manual'));
