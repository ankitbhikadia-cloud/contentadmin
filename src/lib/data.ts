import { createClient } from "@/lib/supabase/server";
import type { Channel, Short, Review, UploadRun } from "@/lib/database.types";

export async function getChannels(): Promise<Channel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .order("created_at", { ascending: true });
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
