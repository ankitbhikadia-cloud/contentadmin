import { createClient } from "@/lib/supabase/server";
import type { Channel, Short, Review, UploadRun } from "@/lib/database.types";

// Channels as returned to the app: OAuth tokens are always redacted here
// so they never end up in a client component's serialized props. Only
// src/lib/youtube.ts and the server actions that call it read the real
// tokens, via getChannelTokens() below — never through this function.
//
// No explicit user filter here — RLS (see supabase/migrations/0004_...)
// scopes this to only the channels the current user is a member of, so
// a login never sees another user's channels or shorts.
export async function getChannels(): Promise<Channel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...c,
    youtube_access_token: null,
    youtube_refresh_token: null,
  }));
}

export type ChannelMemberInfo = { user_id: string; email: string; joined_at: string };

// Who else has access to this channel. Goes through the get_channel_members
// RPC (security definer) rather than a direct select, since auth.users
// emails aren't otherwise exposed to PostgREST — the RPC itself checks
// the caller is a member before returning anything.
export async function getChannelMembers(channelId: string): Promise<ChannelMemberInfo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_channel_members", { cid: channelId });
  if (error) throw error;
  return data ?? [];
}

// Server-only: reads the real OAuth tokens for one channel. Never call
// this from anything whose return value flows into a client component's
// props — only from server actions / route handlers that immediately use
// the tokens themselves (e.g. to call YouTube or refresh the token).
// Accepts whichever Supabase client the caller is already using (the
// per-request authenticated client, or the service-role client for the
// no-session cron job) rather than creating its own.
export async function getChannelTokens(
  supabase: Awaited<ReturnType<typeof createClient>>,
  channelId: string
) {
  const { data, error } = await supabase
    .from("channels")
    .select(
      "id, name, youtube_access_token, youtube_refresh_token, youtube_token_expires_at, youtube_connected"
    )
    .eq("id", channelId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getDueShorts(limit = 5): Promise<Short[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shorts")
    .select("*")
    .eq("status", "scheduled")
    .lte("slot_at", new Date().toISOString())
    .order("slot_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getShorts(opts?: {
  channelId?: string | null;
}): Promise<Short[]> {
  const supabase = await createClient();
  let query = supabase
    .from("shorts")
    .select("*")
    .order("created_at", { ascending: false });
  if (opts?.channelId) query = query.eq("channel_id", opts.channelId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getShortById(id: string): Promise<Short | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shorts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getReviewsForShort(shortId: string): Promise<Review[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("short_id", shortId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getAltTitles(shortId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("short_alt_titles")
    .select("*")
    .eq("short_id", shortId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getUploadRuns(): Promise<UploadRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("upload_runs")
    .select("*")
    .order("attempted_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}

export async function getDashboardCounts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shorts")
    .select("status, slot_at");
  if (error) throw error;
  const rows = data ?? [];

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const startOfWeek = new Date(startOfDay.getTime() - 7 * 24 * 60 * 60 * 1000);

  const scheduled = rows.filter((r) => r.status === "scheduled").length;
  const needsReview = rows.filter((r) => r.status === "needs_review").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const liveThisWeek = rows.filter(
    (r) =>
      r.status === "live" &&
      r.slot_at &&
      new Date(r.slot_at) >= startOfWeek
  ).length;
  const todayCount = rows.filter(
    (r) =>
      r.slot_at &&
      new Date(r.slot_at) >= startOfDay &&
      new Date(r.slot_at) < endOfDay
  ).length;

  return { scheduled, needsReview, failed, liveThisWeek, todayCount };
}
