-- Needed to actually reschedule an already-uploaded video's YouTube
-- publish time (see src/lib/actions.ts's setSlot and the Calendar
-- reschedule flow). publish.ts never persisted the videoId returned by
-- uploadVideoToYoutube anywhere — it only flowed back to the client
-- component that called "Publish now" for a one-time toast — so there
-- was no way to look up which YouTube video a "live" short corresponds
-- to once that request/response was gone.

alter table public.shorts
  add column youtube_video_id text;
