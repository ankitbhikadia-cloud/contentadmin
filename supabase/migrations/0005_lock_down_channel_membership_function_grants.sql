-- Postgres grants EXECUTE to PUBLIC by default, which includes the anon
-- (unauthenticated) role via PostgREST. None of these should be callable
-- without a session — revoke from public/anon, keep authenticated-only.
revoke execute on function public.is_channel_member(uuid) from public;
revoke execute on function public.is_short_member(uuid) from public;
revoke execute on function public.create_or_join_channel(text, text, text, text, text) from public;
revoke execute on function public.get_channel_members(uuid) from public;

grant execute on function public.is_channel_member(uuid) to authenticated;
grant execute on function public.is_short_member(uuid) to authenticated;
grant execute on function public.create_or_join_channel(text, text, text, text, text) to authenticated;
grant execute on function public.get_channel_members(uuid) to authenticated;
