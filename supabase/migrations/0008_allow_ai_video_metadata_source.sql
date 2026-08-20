-- The "Draft with AI" video-aware path (src/lib/gemini.ts,
-- draftMetadata in src/lib/actions.ts) tags a short's metadata_source
-- as "ai_video" when the draft came from Gemini actually watching the
-- video, distinct from the existing "ai" (text-only) source — see
-- format.ts's metadataLabel/metadataTagClass for how the two render
-- differently in the UI.
--
-- That value was never added to the check constraint when the feature
-- shipped, so every video-aware draft failed in production with
-- "new row for relation "shorts" violates check constraint
-- "shorts_metadata_source_check"" the moment someone actually used it.

alter table public.shorts
  drop constraint shorts_metadata_source_check;

alter table public.shorts
  add constraint shorts_metadata_source_check
  check (metadata_source = any (array['none'::text, 'ai'::text, 'ai_video'::text, 'edited'::text]));
