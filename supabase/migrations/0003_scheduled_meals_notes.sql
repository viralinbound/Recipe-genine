-- CookPilot: add a free-text notes field to scheduled meals
-- Run via: supabase db push  (or paste into Supabase SQL editor)

alter table public.scheduled_meals
  add column if not exists notes text;

notify pgrst, 'reload schema';
