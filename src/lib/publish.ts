import type { createClient } from "@/lib/supabase/server";
import { getChannelTokens } from "@/lib/data";
import { refreshAccessToken, uploadVideoToYoutube, type YoutubeUploadMetadata } from "@/lib/youtube";

export type PublishResult = { ok: true; videoId: string } | { ok: false; error: string };

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

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

  const tokens = await getChannelTokens(supabase, short.channel_id);
  if (!tokens || !tokens.youtube_connected || !tokens.youtube_refresh_token) {
    return { ok: false, error: "This channel isn't connected to YouTube yet." };
  }

  await supabase.from("upload_runs").insert({ short_id: shortId, state: "uploading" });

  try {
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
        .eq("id", short.channel_id);
    }

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
      accessToken!,
      videoBytes,
      fileBlob.type || "video/mp4",
      metadata
    );

    await supabase.from("shorts").update({ status: "live" }).eq("id", shortId);
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
const RETRY_WINDOW_HOURS = 1;

/**
 * Real retry policy: up to 3 attempts total (the cron job's own 15-minute
 * cadence provides the "spaced out" retries). Once the 3rd attempt in the
 * last hour fails, the short is marked failed and its slot is pushed
 * forward an hour so it naturally becomes eligible again later, matching
 * the "two retries, then hold the slot an hour" behavior from the design
 * — implemented via attempt-counting against upload_runs rather than a
 * precise 10-minutes-apart timer, since publishing only runs on the
 * cron's own schedule.
 */
async function recordFailureAndMaybeHold(
  supabase: SupabaseLike,
  shortId: string,
  message: string
) {
  const since = new Date(Date.now() - RETRY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
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
    const heldUntil = new Date(Date.now() + RETRY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    await supabase
      .from("shorts")
      .update({ status: "failed", slot_at: heldUntil })
      .eq("id", shortId);
  }
  // Otherwise leave status as "scheduled" so the next cron pass retries it.
}
