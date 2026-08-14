-- CookPilot: complete the handle_new_user() lockdown from 0004
-- Run via: supabase db push  (or paste into Supabase SQL editor)
--
-- Postgres grants EXECUTE to the PUBLIC pseudo-role by default on function
-- creation, which anon/authenticated inherit — revoking from those two
-- roles alone (as 0004 did) doesn't remove the PUBLIC grant itself.

revoke execute on function public.handle_new_user() from public;
