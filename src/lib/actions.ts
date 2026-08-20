"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { draftShortMetadata } from "@/lib/ai";
import { publishShort, type PublishResult } from "@/lib/publish";
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

export async function setSlot(shortId: string, slotAtIso: string | null) {
  const supabase = await createClient();
  const nextStatus = slotAtIso ? "scheduled" : "draft";
  const { data: current } = await supabase
    .from("shorts")
    .select("status")
    .eq("id", shortId)
    .maybeSingle();

  // Don't downgrade a short that's already further along (approved/live/failed).
  const keepStatus =
    current && !["draft", "needs_review", "scheduled"].includes(current.status);

  const { error } = await supabase
    .from("shorts")
    .update({
      slot_at: slotAtIso,
      ...(keepStatus ? {} : { status: nextStatus }),
    })
    .eq("id", shortId);
  if (error) throw error;
  revalidatePath("/calendar");
  revalidatePath("/queue");
  revalidatePath("/dashboard");
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
    // bulk "Generate metadata" cap on the Queue page.
    for (const row of inserted.slice(0, 10)) {
      await draftMetadata(row.id);
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

export async function createChannel(fields: {
  name: string;
  sub?: string;
  cadence?: string;
  youtube_channel_id?: string | null;
}): Promise<ChannelActionResult> {
  const name = fields.name.trim();
  if (!name) return { ok: false, error: "Channel name is required." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("channels")
    .select("*", { count: "exact", head: true });
  const dot = DOT_PALETTE[(count ?? 0) % DOT_PALETTE.length];

  const { error } = await supabase.from("channels").insert({
    name,
    sub: fields.sub?.trim() || null,
    cadence: fields.cadence?.trim() || null,
    youtube_channel_id: fields.youtube_channel_id?.trim() || null,
    dot,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  revalidatePath("/channels");
  return { ok: true };
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
  if (error) return { ok: false, error: error.message };
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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
}

export type DraftResult = { ok: true } | { ok: false; error: string };

// Real Claude API call — see src/lib/ai.ts for exactly what signals it
// drafts from (title/description/filename/channel context, not the
// video itself).
export async function draftMetadata(shortId: string): Promise<DraftResult> {
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
    const drafted = await draftShortMetadata({
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
        metadata_source: "ai",
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
    return { ok: false, error: err instanceof Error ? err.message : "AI drafting failed." };
  }
}

// Bulk version for the Queue page's "Generate metadata" action. Runs
// sequentially (not in parallel) to stay within Claude API rate limits
// and keep this within one server-action invocation's time budget — capped
// at 10 shorts per call for that reason; select fewer at a time for larger
// batches.
export async function bulkDraftMetadata(
  ids: string[]
): Promise<{ succeeded: number; failed: { id: string; error: string }[] }> {
  const capped = ids.slice(0, 10);
  const failed: { id: string; error: string }[] = [];
  let succeeded = 0;
  for (const id of capped) {
    const result = await draftMetadata(id);
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
