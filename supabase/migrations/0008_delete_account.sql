-- In-app account deletion (App Store guideline 5.1.1(v)).
-- The client first removes the user's avatar files, then calls
-- public.delete_my_account(). Deleting the auth.users row cascades to
-- profiles, recipes, collections, recipe_collections and scheduled_meals.

-- Let users delete their own avatar files (needed before the account goes).
drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
