-- CookPilot: security hardening flagged by Supabase's advisor linter
-- Run via: supabase db push  (or paste into Supabase SQL editor)

-- Lock down search_path (prevents search_path hijacking) on trigger functions.
alter function public.set_updated_at() set search_path = public;
alter function public.handle_new_user() set search_path = public;

-- handle_new_user() is SECURITY DEFINER and only meant to run via the
-- on_auth_user_created trigger (triggers invoke under the function owner's
-- rights regardless of EXECUTE grants). Revoke direct-call access so it
-- can't be invoked by anon/authenticated via the auto-generated
-- /rest/v1/rpc/handle_new_user endpoint.
revoke execute on function public.handle_new_user() from anon, authenticated;
