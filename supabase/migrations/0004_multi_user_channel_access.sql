-- Per-user channel access: videos/shorts should not be visible across
-- unrelated logins. A channel can still have multiple members (e.g. two
-- people both adding the same real YouTube channel) — access is via
-- membership, not "any authenticated user".

create table if not exists channel_members (
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

alter table channel_members enable row level security;

-- Prevents two different channel rows silently both claiming the same
-- real YouTube channel — the dedup/auto-join RPC below relies on this
-- being unique to find "does this YT channel already exist here".
create unique index if not exists channels_youtube_channel_id_unique
  on channels (youtube_channel_id)
  where youtube_channel_id is not null;

-- security definer helper so downstream policies (shorts, reviews, etc.)
-- can check membership without re-triggering channel_members' own RLS.
create or replace function public.is_channel_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from channel_members cm
    where cm.channel_id = cid and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_short_member(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from shorts s
    join channel_members cm on cm.channel_id = s.channel_id
    where s.id = sid and cm.user_id = auth.uid()
  );
$$;

-- Atomically create a channel + first membership, OR, if a channel with
-- the same youtube_channel_id already exists, join it instead (the
-- "multiple users can add 1 YT channel" case). security definer so it
-- can look up/insert channels the caller isn't a member of yet.
create or replace function public.create_or_join_channel(
  p_name text,
  p_sub text,
  p_cadence text,
  p_dot text,
  p_youtube_channel_id text
)
returns setof channels
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel channels;
  v_uid uuid := auth.uid();
  v_yt text := nullif(trim(coalesce(p_youtube_channel_id, '')), '');
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_yt is not null then
    select * into v_channel from channels where youtube_channel_id = v_yt limit 1;
  end if;

  if v_channel.id is null then
    insert into channels (name, sub, cadence, dot, youtube_channel_id)
    values (p_name, coalesce(p_sub, ''), coalesce(p_cadence, ''), coalesce(p_dot, '#c67139'), v_yt)
    returning * into v_channel;
  end if;

  insert into channel_members (channel_id, user_id)
  values (v_channel.id, v_uid)
  on conflict (channel_id, user_id) do nothing;

  return query select * from channels where id = v_channel.id;
end;
$$;

grant execute on function public.create_or_join_channel(text, text, text, text, text) to authenticated;

-- Members-only read of who else has access to a channel, incl. email
-- (auth.users isn't otherwise exposed to PostgREST). Scoped so it only
-- ever reveals emails to people who are already members of that channel.
create or replace function public.get_channel_members(cid uuid)
returns table(user_id uuid, email text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_channel_member(cid) then
    raise exception 'Not a member of this channel';
  end if;
  return query
    select cm.user_id, u.email::text, cm.created_at
    from channel_members cm
    join auth.users u on u.id = cm.user_id
    where cm.channel_id = cid
    order by cm.created_at asc;
end;
$$;

grant execute on function public.get_channel_members(uuid) to authenticated;

-- Backfill: give every existing user access to every existing channel,
-- since there's no prior ownership data to migrate from and the app
-- previously gave every authenticated user full access anyway. Prune
-- from the Channels page afterward for anyone who shouldn't have access.
insert into channel_members (channel_id, user_id)
select c.id, u.id from channels c cross join auth.users u
on conflict (channel_id, user_id) do nothing;

-- Replace the old "any authenticated user" policies with membership-scoped ones.

drop policy if exists "Allow all for authenticated" on channels;
drop policy if exists "authenticated_all" on channels;
drop policy if exists "Enable all for authenticated users only" on channels;

drop policy if exists "Allow all for authenticated" on shorts;
drop policy if exists "authenticated_all" on shorts;
drop policy if exists "Enable all for authenticated users only" on shorts;

drop policy if exists "Allow all for authenticated" on short_alt_titles;
drop policy if exists "authenticated_all" on short_alt_titles;
drop policy if exists "Enable all for authenticated users only" on short_alt_titles;

drop policy if exists "Allow all for authenticated" on reviews;
drop policy if exists "authenticated_all" on reviews;
drop policy if exists "Enable all for authenticated users only" on reviews;

drop policy if exists "Allow all for authenticated" on upload_runs;
drop policy if exists "authenticated_all" on upload_runs;
drop policy if exists "Enable all for authenticated users only" on upload_runs;

drop policy if exists "Allow all for authenticated" on import_batches;
drop policy if exists "authenticated_all" on import_batches;
drop policy if exists "Enable all for authenticated users only" on import_batches;

create policy "members_select" on channels for select to authenticated
  using (is_channel_member(id));
create policy "members_update" on channels for update to authenticated
  using (is_channel_member(id));
create policy "members_delete" on channels for delete to authenticated
  using (is_channel_member(id));
-- No insert policy: creating a channel goes through create_or_join_channel
-- (security definer), so a direct client insert is intentionally blocked.

create policy "channel_members_select" on channel_members for select to authenticated
  using (is_channel_member(channel_id));
create policy "channel_members_delete" on channel_members for delete to authenticated
  using (is_channel_member(channel_id));
-- No insert policy here either — membership is only ever created via
-- create_or_join_channel, never a direct client insert.

create policy "members_select" on shorts for select to authenticated
  using (is_channel_member(channel_id));
create policy "members_insert" on shorts for insert to authenticated
  with check (is_channel_member(channel_id));
create policy "members_update" on shorts for update to authenticated
  using (is_channel_member(channel_id));
create policy "members_delete" on shorts for delete to authenticated
  using (is_channel_member(channel_id));

create policy "members_select" on short_alt_titles for select to authenticated
  using (is_short_member(short_id));
create policy "members_insert" on short_alt_titles for insert to authenticated
  with check (is_short_member(short_id));
create policy "members_delete" on short_alt_titles for delete to authenticated
  using (is_short_member(short_id));

create policy "members_select" on reviews for select to authenticated
  using (is_short_member(short_id));
create policy "members_insert" on reviews for insert to authenticated
  with check (is_short_member(short_id));

create policy "members_select" on upload_runs for select to authenticated
  using (is_short_member(short_id));
create policy "members_insert" on upload_runs for insert to authenticated
  with check (is_short_member(short_id));

create policy "members_select" on import_batches for select to authenticated
  using (channel_id is not null and is_channel_member(channel_id));
create policy "members_insert" on import_batches for insert to authenticated
  with check (channel_id is not null and is_channel_member(channel_id));
