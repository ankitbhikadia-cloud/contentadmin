-- Real YouTube Data API v3 OAuth storage, per channel.
-- Tokens are never selected into any query that reaches a client
-- component — see getChannels() in src/lib/data.ts, which redacts them
-- and exposes only a `youtube_connected` boolean instead.
alter table channels
  add column if not exists youtube_connected boolean not null default false,
  add column if not exists youtube_access_token text,
  add column if not exists youtube_refresh_token text,
  add column if not exists youtube_token_expires_at timestamptz;
