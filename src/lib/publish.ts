import type { createClient } from "@/lib/supabase/server";
import { getChannelTokens } from "@/lib/data";
import { refreshAccessToken, uploadVideoToYoutube, type YoutubeUploadMetadata } from "@/lib/youtube";

export type PublishResult = { ok: true; videoId: string } | { ok: false; error: string };

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

/**
 * Returns a live YouTube access token for a channel, refreshing it first
 * if it's missing or about to expire (and persisting the refreshed token
 * back onto the channel row). Shared by publishShort below and by the
 * calendar reschedule path in actions.ts's setSlot, which needs a token
 * for the exact same reason — calling the YouTube API on this channel's
 * behalf — without repeating a second copy of this refresh dance.
 */
export async function getValidAccessToken(
  supabase: SupabaseLike,
  channelId: string
): Promise<string> {
  const tokens = await getChannelTokens(supabase, channelId);
  if (!tokens || !tokens.youtube_connected || !tokens.youtube_refresh_token) {
    throw new Error("This channel isn't connected to YouTube yet.");
  }

  let accessToken = tokens.youtube_access_token;
  const expired =
    !tokens.youtube_token_expires_at ||
    new Date(tokens.youtube_token_expires_at).getTime() < Date.now() + 60_000;
  if (!accessToken || expired) {
    const refreshed = await refreshAccessToken(tokens.youtube_refresh_token);
    accessToken = refreshed.access_token;
    await supabase
      .from("channels")
      .update({
        youtube_access_token: refreshed.access_token,
        youtube_token_expires_at: new Date(
          Date.now() + refreshed.expires_in * 1000
        ).toISOString(),
      })
      .eq("id", channelId);
  }
  return accessToken!;
}

/**
 * The real publish path, shared by the interactive "Publish now" action
 * (authenticated-user client) and the publish-due cron route
 * (service-role client, since a cron request has no user session).
 */
export async function publishShort(
  supabase: SupabaseLike,
  shortId: string
): Promise<PublishResult> {
  const { data: short, error: shortErr } = await supabase
    .from("shorts")
    .select("*")
    .eq("id", shortId)
    .maybeSingle();
  if (shortErr) return { ok: false, error: shortErr.message };
  if (!short) return { ok: false, error: "Short not found." };
  if (!short.file_path) return { ok: false, error: "This short has no uploaded file." };

  // Checked here, before touching upload_runs/status at all, so a channel
  // that was simply never connected doesn't count as a failed *upload*
  // attempt against the retry budget below — same behavior as before this
  // function started sharing its token-refresh logic with the calendar
  // reschedule path via getValidAccessToken.
  const tokens = await getChannelTokens(supabase, short.channel_id);
  if (!tokens || !tokens.youtube_connected || !tokens.youtube_refresh_token) {
    return { ok: false, error: "This channel isn't connected to YouTube yet." };
  }

  await supabase.from("upload_runs").insert({ short_id: shortId, state: "uploading" });

  try {
    const accessToken = await getValidAccessToken(supabase, short.channel_id);

    const { data: fileBlob, error: downloadErr } = await supabase.storage
      .from("shorts")
      .download(short.file_path);
    if (downloadErr || !fileBlob) {
      throw new Error(downloadErr?.message ?? "Couldn't download the file from Storage.");
    }
    const videoBytes = await fileBlob.arrayBuffer();

    const metadata: YoutubeUploadMetadata = {
      title: short.title,
      description: short.description,
      tags: short.tags ?? [],
      privacyStatus: (short.visibility as YoutubeUploadMetadata["privacyStatus"]) ?? "public",
      selfDeclaredMadeForKids: short.made_for_kids,
      publishAt: short.slot_at && new Date(short.slot_at) > new Date() ? short.slot_at : null,
    };

    const { videoId } = await uploadVideoToYoutube(
      accessToken,
      videoBytes,
      fileBlob.type || "video/mp4",
      metadata
    );

    await supabase
      .from("shorts")
      .update({ status: "live", youtube_video_id: videoId })
      .eq("id", shortId);
    await supabase.from("upload_runs").insert({
      short_id: shortId,
      state: "live",
      progress_pct: 100,
    });

    return { ok: true, videoId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    await recordFailureAndMaybeHold(supabase, shortId, message);
    return { ok: false, error: message };
  }
}

const MAX_ATTEMPTS = 3; // initial attempt + 2 retries

// How far back to look when counting a short's recent failures. This has
// to be wider than the gap between automatic retries, or the exhaustion
// check below would never see more than one attempt at a time and a
// broken short would just retry forever. The cron (see vercel.json) runs
// once a day on the Hobby plan (Vercel caps Hobby cron to daily — a
// 15-minute cadence needs the Pro plan), so 3 daily attempts span up to
// ~48 hours; 96 hours gives that a comfortable buffer. Manual "Publish
// now" / "Check now" clicks use this same window, so repeated manual
// retries within those 4 days count toward exhaustion too — that's
// intentional, not a leftover from a faster cadence.
const RETRY_LOOKBACK_HOURS = 96;
const HOLD_HOURS = 1; // how far to push slot_at out once a short is marked failed

/**
 * Real retry policy: up to 3 attempts total. Once the 3rd attempt within
 * the lookback window fails, the short is marked failed and its slot is
 * pushed forward an hour so it stops visually sitting on its original
 * (missed) slot on the calendar — implemented via attempt-counting
 * against upload_runs rather than a precise timer, since automatic
 * publishing only runs on the cron's own schedule.
 */
async function recordFailureAndMaybeHold(
  supabase: SupabaseLike,
  shortId: string,
  message: string
) {
  const since = new Date(Date.now() - RETRY_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("upload_runs")
    .select("*", { count: "exact", head: true })
    .eq("short_id", shortId)
    .eq("state", "failed")
    .gte("attempted_at", since);

  const attemptNumber = (count ?? 0) + 1;
  const exhausted = attemptNumber >= MAX_ATTEMPTS;

  await supabase.from("upload_runs").insert({
    short_id: shortId,
    state: "failed",
    error_message: `Attempt ${attemptNumber}/${MAX_ATTEMPTS}: ${message}`.slice(0, 500),
  });

  if (exhausted) {
    const heldUntil = new Date(Date.now() + HOLD_HOURS * 60 * 60 * 1000).toISOString();
    await supabase
      .from("shorts")
      .update({ status: "failed", slot_at: heldUntil })
      .eq("id", shortId);
  }
  // Otherwise leave status as "scheduled" so the next cron pass retries it.
}
