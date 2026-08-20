-- The 0004 migration guessed at the original policy name and got it
-- wrong, so the real "authenticated full access" (ALL, qual true) policy
-- from 0001_init.sql was still active on every table alongside the new
-- membership-scoped ones — RLS OR's policies together, so the old
-- permissive one silently kept every row visible to every authenticated
-- user this whole time. Confirmed via pg_policies and a real production
-- error (P0001 "Not a member of this channel" from get_channel_members,
-- thrown for a channel that channels-select was still — wrongly —
-- returning). Drop the actual policy this time.

drop policy if exists "authenticated full access" on channels;
drop policy if exists "authenticated full access" on shorts;
drop policy if exists "authenticated full access" on short_alt_titles;
drop policy if exists "authenticated full access" on reviews;
drop policy if exists "authenticated full access" on upload_runs;
drop policy if exists "authenticated full access" on import_batches;
