"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { draftShortMetadata } from "@/lib/ai";
import { draftMetadataFromVideo } from "@/lib/gemini";
import { publishShort, getValidAccessToken, type PublishResult } from "@/lib/publish";
import {
  getVideoStatus,
  updateScheduledPublishTime,
  getVideoSnippet,
  updateVideoSnippet,
  withHashtags,
} from "@/lib/youtube";
import { getDueShorts } from "@/lib/data";

export async function approveShort(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("shorts")
    .update({ status: "approved" })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/queue");
  revalidatePath("/dashboard");
  revalidatePath(`/shorts/${id}`);
}

export async function bulkApprove(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("shorts")
    .update({ status: "approved" })
    .in("id", ids);
  if (error) throw error;
  revalidatePath("/queue");
  revalidatePath("/dashboard");
}

export async function updateShortFields(
  id: string,
  fields: {
    title?: string;
    description?: string;
    tags?: string[];
    visibility?: string;
    playlist?: string | null;
    made_for_kids?: boolean;
    allow_comments?: boolean;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("shorts")
    .update({ ...fields, metadata_source: "edited" })
    .eq("id", id);
  if (error) throw error;
  revalidatePath(`/shorts/${id}`);
  revalidatePath("/queue");
}

export async function addReview(shortId: string, author: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .insert({ short_id: shortId, author, body: trimmed });
  if (error) throw error;
  revalidatePath(`/shorts/${shortId}`);
}

export type RescheduleResult = { ok: true } | { ok: false; error: string };

/**
 * Moves a short's calendar slot. Used both for giving an unscheduled
 * short its first slot (drag from the Inbox) and for moving an
 * already-scheduled one (drag between days, or the precise date/time
 * editor) — see CalendarClient.tsx, where every call here is gated
 * behind an explicit confirm step first.
 *
 * A short that's already "live" needs real YouTube coordination: if it
 * was uploaded early (via "Publish now" while its slot was still in the
 * future — see publish.ts), the video exists on YouTube already, privately
 * scheduled for that original time. Moving the date here without also
 * moving it there would leave our calendar and the actual YouTube publish
 * time silently disagreeing, so this calls YouTube's videos.update to
 * keep them in sync — and refuses outright if the video's already
 * actually public, since there's no "scheduled time" left to change at
 * that point. Anything not yet live has nothing on YouTube to keep in
 * sync with, so that path stays a plain DB update, same as before.
 */
export async function setSlot(
  shortId: string,
  slotAtIso: string | null
): Promise<RescheduleResult> {
  const supabase = await createClient();
  const { data: current, error: fetchErr } = await supabase
    .from("shorts")
    .select("status, channel_id, youtube_video_id")
    .eq("id", shortId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!current) return { ok: false, error: "Short not found." };

  if (current.status === "live") {
    if (!slotAtIso) {
      return { ok: false, error: "A live short can't be sent back to the unscheduled inbox." };
    }
    const videoId = current.youtube_video_id;
    if (!videoId) {
      return {
        ok: false,
        error:
          "This short has no recorded YouTube video id (it was likely uploaded before this feature shipped), so its schedule can't be safely changed here.",
      };
    }
    try {
      const accessToken = await getValidAccessToken(supabase, current.channel_id);
      const status = await getVideoStatus(accessToken, videoId);
      if (!status) {
        return { ok: false, error: "Couldn't find this video on YouTube anymore." };
      }
      if (status.privacyStatus === "public") {
        return {
          ok: false,
          error: "This video is already public on YouTube — its publish time can't be changed anymore.",
        };
      }
      await updateScheduledPublishTime(accessToken, videoId, status, slotAtIso);
    } catch (err) {
      console.error(`setSlot(${shortId}) YouTube reschedule failed:`, err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Couldn't reschedule on YouTube.",
      };
    }

    const { error } = await supabase
      .from("shorts")
      .update({ slot_at: slotAtIso })
      .eq("id", shortId);
    if (error) return { ok: false, error: error.message };
  } else {
    const nextStatus = slotAtIso ? "scheduled" : "draft";
    // Don't downgrade a short that's already further along (approved/failed).
    const keepStatus = !["draft", "needs_review", "scheduled"].includes(current.status);
    const { error } = await supabase
      .from("shorts")
      .update({
        slot_at: slotAtIso,
        ...(keepStatus ? {} : { status: nextStatus }),
      })
      .eq("id", shortId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/calendar");
  revalidatePath("/queue");
  revalidatePath("/dashboard");
  revalidatePath(`/shorts/${shortId}`);
  return { ok: true };
}

export type ImportBatchSettings = {
  spreadDays: number; // 0 = don't auto-slot, leave in the Inbox
  aiDraft: boolean;
  sendForReview: boolean;
};

export async function createShortsFromImport(
  channelId: string,
  files: { name: string; size: number; path: string }[],
  settings: ImportBatchSettings
) {
  if (files.length === 0) return;
  const supabase = await createClient();

  const initialStatus = settings.sendForReview ? "needs_review" : "draft";
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const rows = files.map((f, i) => {
    let slot_at: string | null = null;
    if (settings.spreadDays > 0) {
      // Evenly spread across the window, starting tomorrow, round-robin
      // across the days so a big batch doesn't stack every clip on day 1.
      const dayOffset = 1 + (i % settings.spreadDays);
      const slot = new Date(now + dayOffset * dayMs);
      slot.setUTCHours(16, 0, 0, 0); // fixed 16:00 UTC slot time
      slot_at = slot.toISOString();
    }
    return {
      channel_id: channelId,
      title: f.name.replace(/\.[^/.]+$/, ""),
      file_name: f.name,
      file_size_bytes: f.size,
      file_path: f.path,
      status: initialStatus,
      metadata_source: "none",
      slot_at,
    };
  });

  const { data: inserted, error } = await supabase
    .from("shorts")
    .insert(rows)
    .select("id");
  if (error) throw error;

  await supabase.from("import_batches").insert({
    channel_id: channelId,
    spread_days: settings.spreadDays,
    ai_draft: settings.aiDraft,
    send_for_review: settings.sendForReview,
  });

  revalidatePath("/import");
  revalidatePath("/queue");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");

  if (settings.aiDraft && inserted) {
    // Cap to keep this within one request's time budget — matches the
    // bulk "Generate metadata" cap on the Queue page. preferVideo: false
    // for the same reason as bulkDraftMetadata — this loop runs
    // sequentially inside the single request the Import page's "Upload &
    // send to queue" click makes, and the video-aware path's per-item
    // upload+process+generate round trip would make 10 of them here
    // take minutes, not seconds. Revisit an individual short's detail
    // page for a real video-aware draft.
    for (const row of inserted.slice(0, 10)) {
      await draftMetadata(row.id, { preferVideo: false });
    }
  }
}

const DOT_PALETTE = [
  "#c67139", // terracotta
  "#7a8a5e", // sage
  "#8a8a8a", // neutral
  "#5e7a8a", // slate blue
  "#a8763c", // amber
  "#6a8a72", // moss
];

export type ChannelActionResult = { ok: true } | { ok: false; error: string };
export type CreateChannelResult =
  | { ok: true; joinedExisting: boolean }
  | { ok: false; error: string };

// Creates a channel scoped to the current user, or — if someone else has
// already added this same real YouTube channel (matched by
// youtube_channel_id) — joins them as a co-member of that existing
// channel instead, so they see its real shorts/history rather than
// getting a disconnected duplicate. Both paths run atomically in
// create_or_join_channel (see supabase/migrations/0004_...) so a channel
// row can never end up with zero members.
export async function createChannel(fields: {
  name: string;
  sub?: string;
  cadence?: string;
  youtube_channel_id?: string | null;
}): Promise<CreateChannelResult> {
  const name = fields.name.trim();
  if (!name) return { ok: false, error: "Channel name is required." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("channel_members")
    .select("*", { count: "exact", head: true });
  const dot = DOT_PALETTE[(count ?? 0) % DOT_PALETTE.length];

  const { data, error } = await supabase.rpc("create_or_join_channel", {
    p_name: name,
    p_sub: fields.sub?.trim() || "",
    p_cadence: fields.cadence?.trim() || "",
    p_dot: dot,
    p_youtube_channel_id: fields.youtube_channel_id?.trim() || "",
  });
  if (error) return { ok: false, error: error.message };
  const channel = Array.isArray(data) ? data[0] : data;
  if (!channel) return { ok: false, error: "Something went wrong creating the channel." };

  const { count: memberCount } = await supabase
    .from("channel_members")
    .select("*", { count: "exact", head: true })
    .eq("channel_id", channel.id);

  revalidatePath("/", "layout");
  revalidatePath("/channels");
  return { ok: true, joinedExisting: (memberCount ?? 1) > 1 };
}

export async function updateChannel(
  id: string,
  fields: {
    name?: string;
    sub?: string | null;
    cadence?: string | null;
    youtube_channel_id?: string | null;
  }
): Promise<ChannelActionResult> {
  if (fields.name !== undefined && !fields.name.trim()) {
    return { ok: false, error: "Channel name is required." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("channels")
    .update({
      ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
      ...(fields.sub !== undefined ? { sub: fields.sub?.trim() || null } : {}),
      ...(fields.cadence !== undefined
        ? { cadence: fields.cadence?.trim() || null }
        : {}),
      ...(fields.youtube_channel_id !== undefined
        ? { youtube_channel_id: fields.youtube_channel_id?.trim() || null }
        : {}),
    })
    .eq("id", id);
  if (error) {
    // Postgres unique_violation on channels_youtube_channel_id_unique —
    // someone else already has this exact YouTube channel ID registered.
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "That YouTube channel ID is already connected under a different channel here. Use \"Add a channel\" with that same ID instead — you'll join it as a co-member.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  revalidatePath("/channels");
  return { ok: true };
}

export async function deleteChannel(id: string): Promise<ChannelActionResult> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("shorts")
    .select("*", { count: "exact", head: true })
    .eq("channel_id", id);
  if (count && count > 0) {
    return {
      ok: false,
      error: `This channel has ${count} short${count === 1 ? "" : "s"} — remove or reassign them first.`,
    };
  }
  const { error } = await supabase.from("channels").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  revalidatePath("/channels");
  return { ok: true };
}

// Removes a member's access to a channel (or lets someone leave it
// themselves). Refuses to remove the last remaining member — that would
// orphan the channel (RLS would make it invisible to everyone, including
// service-role automation still has access, but no one could manage it
// from the app again without going through the database directly).
export async function removeChannelMember(
  channelId: string,
  userId: string
): Promise<ChannelActionResult> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("channel_members")
    .select("*", { count: "exact", head: true })
    .eq("channel_id", channelId);
  if ((count ?? 0) <= 1) {
    return {
      ok: false,
      error: "Can't remove the last person with access — delete the channel instead.",
    };
  }
  const { error } = await supabase
    .from("channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  revalidatePath("/channels");
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
}

export type DraftResult = { ok: true } | { ok: false; error: string };

// Video-aware when it can be: if GEMINI_API_KEY is set and the short has
// an uploaded file, downloads it from Storage and drafts from the actual
// video via src/lib/gemini.ts. Otherwise (no key configured, or no file
// yet) falls back to the text-only Claude path in src/lib/ai.ts. This
// fallback is only for "not configured" — a configured-but-failing
// Gemini call surfaces its real error rather than silently degrading to
// the text-only path, so a quota/processing failure doesn't masquerade
// as a worse-but-successful draft.
//
// opts.preferVideo defaults to true for the single-short "Draft with AI"
// button. bulkDraftMetadata (Queue's "Generate metadata", up to 10 items
// sequentially in one server-action call) explicitly passes false —
// video drafting's upload+processing+generate round trip is far slower
// per item than the text-only path, and doing that 10x sequentially
// risks blowing the 300s function budget.
export async function draftMetadata(
  shortId: string,
  opts?: { preferVideo?: boolean }
): Promise<DraftResult> {
  const preferVideo = opts?.preferVideo ?? true;
  const supabase = await createClient();
  const { data: short, error: shortErr } = await supabase
    .from("shorts")
    .select("*")
    .eq("id", shortId)
    .maybeSingle();
  if (shortErr) return { ok: false, error: shortErr.message };
  if (!short) return { ok: false, error: "Short not found." };

  const { data: channel } = await supabase
    .from("channels")
    .select("name, cadence")
    .eq("id", short.channel_id)
    .maybeSingle();

  try {
    const useVideo = preferVideo && !!short.file_path && !!process.env.GEMINI_API_KEY;

    const drafted = useVideo
      ? await (async () => {
          const { data: fileBlob, error: downloadErr } = await supabase.storage
            .from("shorts")
            .download(short.file_path!);
          if (downloadErr || !fileBlob) {
            throw new Error(
              downloadErr?.message ?? "Couldn't download the video file from Storage."
            );
          }
          return draftMetadataFromVideo({
            videoBytes: await fileBlob.arrayBuffer(),
            mimeType: fileBlob.type || "video/mp4",
            fileDisplayName: short.file_name ?? "short.mp4",
            currentTitle: short.title,
            currentDescription: short.description,
            channelName: channel?.name ?? "this channel",
            channelCadence: channel?.cadence ?? null,
            existingTags: short.tags ?? [],
          });
        })()
      : await draftShortMetadata({
          currentTitle: short.title,
          currentDescription: short.description,
          fileName: short.file_name,
          channelName: channel?.name ?? "this channel",
          channelCadence: channel?.cadence ?? null,
          existingTags: short.tags ?? [],
        });

    const { error: updateErr } = await supabase
      .from("shorts")
      .update({
        title: drafted.title,
        description: drafted.description,
        tags: drafted.tags,
        trend_score: drafted.trendScore,
        trend_note: drafted.trendNote,
        metadata_source: useVideo ? "ai_video" : "ai",
      })
      .eq("id", shortId);
    if (updateErr) return { ok: false, error: updateErr.message };

    // Replace any previous AI alt titles for this short with the fresh set.
    await supabase.from("short_alt_titles").delete().eq("short_id", shortId);
    if (drafted.altTitles.length > 0) {
      await supabase.from("short_alt_titles").insert(
        drafted.altTitles.map((text) => ({ short_id: shortId, text }))
      );
    }

    revalidatePath(`/shorts/${shortId}`);
    revalidatePath("/queue");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    // Log server-side — this was previously swallowed entirely (caught
    // here, only ever surfaced as a one-line message in the UI), which
    // made a real Claude API response-shape bug invisible in Vercel's
    // logs while debugging it.
    console.error(`draftMetadata(${shortId}) failed:`, err);
    return { ok: false, error: err instanceof Error ? err.message : "AI drafting failed." };
  }
}

// Bulk version for the Queue page's "Generate metadata" action. Runs
// sequentially (not in parallel) to stay within Claude API rate limits
// and keep this within one server-action invocation's time budget — capped
// at 10 shorts per call for that reason; select fewer at a time for larger
// batches. Deliberately stays on the fast text-only path (preferVideo:
// false) rather than the video-aware one — 10 sequential Gemini
// upload+process+generate round trips would risk the 300s function
// budget. Use "Draft with AI" on a short's own detail page for the real
// video-aware draft.
export async function bulkDraftMetadata(
  ids: string[]
): Promise<{ succeeded: number; failed: { id: string; error: string }[] }> {
  const capped = ids.slice(0, 10);
  const failed: { id: string; error: string }[] = [];
  let succeeded = 0;
  for (const id of capped) {
    const result = await draftMetadata(id, { preferVideo: false });
    if (result.ok) succeeded++;
    else failed.push({ id, error: result.error });
  }
  revalidatePath("/queue");
  revalidatePath("/dashboard");
  return { succeeded, failed };
}

export async function useAltTitle(shortId: string, title: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("shorts")
    .update({ title })
    .eq("id", shortId);
  if (error) throw error;
  revalidatePath(`/shorts/${shortId}`);
  revalidatePath("/queue");
}

export async function disconnectChannel(channelId: string): Promise<ChannelActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("channels")
    .update({
      youtube_connected: false,
      youtube_access_token: null,
      youtube_refresh_token: null,
      youtube_token_expires_at: null,
    })
    .eq("id", channelId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  revalidatePath("/channels");
  revalidatePath("/auto-uploader");
  return { ok: true };
}

// Real YouTube publish, triggered interactively by a signed-in user. See
// src/lib/publish.ts for the shared logic (also used by the no-session
// publish-due cron route via a service-role client) — refreshes the
// channel's access token if needed, downloads the file from Supabase
// Storage, and calls videos.insert. Single-request multipart upload —
// fine for typical Shorts-sized files, but there's no chunked/resumable
// retry, and it needs the containing page to raise maxDuration (see
// src/app/(app)/shorts/[id]/page.tsx and
// src/app/(app)/auto-uploader/page.tsx) since a real upload can take
// longer than Vercel's default function timeout.
export async function publishShortNow(shortId: string): Promise<PublishResult> {
  const supabase = await createClient();
  const result = await publishShort(supabase, shortId);
  revalidatePath(`/shorts/${shortId}`);
  revalidatePath("/queue");
  revalidatePath("/dashboard");
  revalidatePath("/auto-uploader");
  return result;
}

// Manual "check now" on the Auto-uploader page — runs the same logic the
// cron job runs on its own 15-minute schedule, on demand, using the
// current signed-in user's session instead of the service-role client.
export async function checkAndPublishDue(): Promise<{
  checked: number;
  succeeded: number;
  failed: number;
}> {
  const supabase = await createClient();
  const due = await getDueShorts(5);
  let succeeded = 0;
  for (const short of due) {
    const result = await publishShort(supabase, short.id);
    if (result.ok) succeeded++;
  }
  revalidatePath("/auto-uploader");
  revalidatePath("/queue");
  revalidatePath("/dashboard");
  return { checked: due.length, succeeded, failed: due.length - succeeded };
}

/**
 * Pushes this short's current title/description/tags to its
 * already-uploaded YouTube video — for when the metadata changed after
 * publishing (a later "Draft with AI" run, a manual edit) and the real
 * video on YouTube needs to catch up. Only meaningful for a short that
 * already has a recorded youtube_video_id; publishShort (in publish.ts)
 * is the one-time upload, this is the repeatable metadata sync.
 */
export async function syncMetadataToYoutube(shortId: string): Promise<RescheduleResult> {
  const supabase = await createClient();
  const { data: short, error: fetchErr } = await supabase
    .from("shorts")
    .select("*")
    .eq("id", shortId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!short) return { ok: false, error: "Short not found." };
  if (!short.youtube_video_id) {
    return { ok: false, error: "This short has no recorded YouTube video id yet — nothing to sync to." };
  }

  try {
    const accessToken = await getValidAccessToken(supabase, short.channel_id);
    const currentSnippet = await getVideoSnippet(accessToken, short.youtube_video_id);
    if (!currentSnippet) {
      return { ok: false, error: "Couldn't find this video on YouTube anymore." };
    }
    await updateVideoSnippet(accessToken, short.youtube_video_id, currentSnippet, {
      title: short.title,
      description: withHashtags(short.description, short.tags ?? []),
      tags: short.tags ?? [],
    });
  } catch (err) {
    console.error(`syncMetadataToYoutube(${shortId}) failed:`, err);
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't sync to YouTube." };
  }

  revalidatePath(`/shorts/${shortId}`);
  return { ok: true };
}
