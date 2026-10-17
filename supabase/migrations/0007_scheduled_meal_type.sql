-- Optional meal_type on scheduled meals (Breakfast/Lunch/Snack/Dinner).
alter table public.scheduled_meals
  add column if not exists meal_type text;

alter table public.scheduled_meals
  drop constraint if exists scheduled_meals_meal_type_check;

alter table public.scheduled_meals
  add constraint scheduled_meals_meal_type_check
  check (
    meal_type is null
    or meal_type in ('Breakfast', 'Lunch', 'Snack', 'Dinner')
  );

notify pgrst, 'reload schema';
