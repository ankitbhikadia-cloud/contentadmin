-- The three channels seeded in 0001_init.sql were placeholders copied from
-- the design mockup so the app wasn't empty on first load. Now that channel
-- management is a real feature (see /channels), remove the two mock
-- channels that never accumulated any real data.
--
-- "Desk Reset Daily" is deliberately left alone here — real Shorts were
-- imported against it during testing, so deleting it would orphan that
-- data. Rename it to a real channel name from the Channels page instead.
delete from channels
where name in ('Money in Minutes', 'Mindful Minute')
  and not exists (
    select 1 from shorts where shorts.channel_id = channels.id
  );
