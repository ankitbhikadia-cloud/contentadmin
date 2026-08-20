-- ContentAdmin initial schema
-- Multi-channel YouTube Shorts pipeline: import -> metadata -> review -> schedule -> publish

create extension if not exists "pgcrypto";

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sub text default '',
  dot text default '#c67139',
  cadence text default '',
  youtube_channel_id text,
  created_at timestamptz not null default now()
);

create table if not exists shorts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  title text not null default 'Untitled clip',
  description text not null default '',
  tags text[] not null default '{}',
  file_path text,
  file_name text,
  file_size_bytes bigint,
  duration_seconds numeric,
  status text not null default 'draft'
    check (status in ('draft','needs_review','approved','scheduled','live','failed')),
  slot_at timestamptz,
  visibility text not null default 'public'
    check (visibility in ('public','unlisted','private')),
  playlist text,
  made_for_kids boolean not null default false,
  allow_comments boolean not null default true,
  trend_score int,
  trend_note text,
  metadata_source text not null default 'none'
    check (metadata_source in ('none','ai','edited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists short_alt_titles (
  id uuid primary key default gen_random_uuid(),
  short_id uuid not null references shorts(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  short_id uuid not null references shorts(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists upload_runs (
  id uuid primary key default gen_random_uuid(),
  short_id uuid not null references shorts(id) on delete cascade,
  state text not null
    check (state in ('queued','uploading','held','failed','live')),
  progress_pct int,
  attempted_at timestamptz not null default now(),
  error_message text
);

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id) on delete set null,
  spread_days int not null default 7,
  ai_draft boolean not null default true,
  send_for_review boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists shorts_channel_id_idx on shorts(channel_id);
create index if not exists shorts_status_idx on shorts(status);
create index if not exists shorts_slot_at_idx on shorts(slot_at);
create index if not exists reviews_short_id_idx on reviews(short_id);
create index if not exists upload_runs_short_id_idx on upload_runs(short_id);

-- updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists shorts_set_updated_at on shorts;
create trigger shorts_set_updated_at before update on shorts
  for each row execute function set_updated_at();

-- RLS: this is an internal team tool, not multi-tenant.
-- Any authenticated user (the team) has full access; anon has none.
alter table channels enable row level security;
alter table shorts enable row level security;
alter table short_alt_titles enable row level security;
alter table reviews enable row level security;
alter table upload_runs enable row level security;
alter table import_batches enable row level security;

create policy "authenticated full access" on channels
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on shorts
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on short_alt_titles
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on reviews
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on upload_runs
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on import_batches
  for all to authenticated using (true) with check (true);

-- Storage bucket for uploaded short video files
insert into storage.buckets (id, name, public)
values ('shorts', 'shorts', false)
on conflict (id) do nothing;

create policy "authenticated read shorts bucket" on storage.objects
  for select to authenticated using (bucket_id = 'shorts');
create policy "authenticated write shorts bucket" on storage.objects
  for insert to authenticated with check (bucket_id = 'shorts');
create policy "authenticated update shorts bucket" on storage.objects
  for update to authenticated using (bucket_id = 'shorts');
create policy "authenticated delete shorts bucket" on storage.objects
  for delete to authenticated using (bucket_id = 'shorts');

-- Seed the three channels from the design so the app isn't empty on first load
insert into channels (name, sub, dot, cadence) values
  ('Desk Reset Daily', '128k · 4/wk', '#c67139', '4/wk'),
  ('Money in Minutes', '61k · 6/wk', '#7a8a5e', '6/wk'),
  ('Mindful Minute', '19k · 5/wk', '#8a8a8a', '5/wk')
on conflict do nothing;
