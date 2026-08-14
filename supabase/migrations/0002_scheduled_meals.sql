-- CookPilot: scheduled meals (Recipe Meal Scheduler and Reminder)
-- Run via: supabase db push  (or paste into Supabase SQL editor)

create table if not exists public.scheduled_meals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  recipe_title text not null,
  scheduled_date date not null,
  prep_time int not null default 0,
  cook_time int not null default 0,
  start_cooking_time timestamptz not null,
  target_eating_time timestamptz not null,
  reminder_offset int not null default 15,
  notification_id text,
  calendar_event_id text,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_meals_user_id_idx on public.scheduled_meals(user_id);
create index if not exists scheduled_meals_target_eating_time_idx on public.scheduled_meals(target_eating_time);

alter table public.scheduled_meals enable row level security;

-- drop-then-create so this migration is safe to paste and run more than
-- once (e.g. after a partial failure on an earlier attempt).
drop policy if exists "Users can view own scheduled meals" on public.scheduled_meals;
create policy "Users can view own scheduled meals"
  on public.scheduled_meals for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own scheduled meals" on public.scheduled_meals;
create policy "Users can insert own scheduled meals"
  on public.scheduled_meals for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own scheduled meals" on public.scheduled_meals;
create policy "Users can update own scheduled meals"
  on public.scheduled_meals for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own scheduled meals" on public.scheduled_meals;
create policy "Users can delete own scheduled meals"
  on public.scheduled_meals for delete
  using (auth.uid() = user_id);

-- Nudge PostgREST to pick up the new table immediately instead of waiting
-- for its next periodic schema-cache refresh.
notify pgrst, 'reload schema';
