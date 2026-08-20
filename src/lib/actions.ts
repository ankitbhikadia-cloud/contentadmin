"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

export async function createShortsFromImport(
  channelId: string,
  files: { name: string; size: number; path: string }[]
) {
  if (files.length === 0) return;
  const supabase = await createClient();
  const rows = files.map((f) => ({
    channel_id: channelId,
    title: f.name.replace(/\.[^/.]+$/, ""),
    file_name: f.name,
    file_size_bytes: f.size,
    file_path: f.path,
    status: "draft",
    metadata_source: "none",
  }));
  const { error } = await supabase.from("shorts").insert(rows);
  if (error) throw error;
  revalidatePath("/import");
  revalidatePath("/queue");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
}
