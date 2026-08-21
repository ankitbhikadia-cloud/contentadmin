import { notFound } from "next/navigation";
import { getShortById, getChannels, getReviewsForShort, getAltTitles } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import ShortDetailClient from "./ShortDetailClient";

export const dynamic = "force-dynamic";
// Real YouTube uploads can take longer than the default function timeout —
// see src/lib/publish.ts.
export const maxDuration = 300;

export default async function ShortDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [short, channels, reviews, altTitles] = await Promise.all([
    getShortById(id),
    getChannels(),
    getReviewsForShort(id),
    getAltTitles(id),
  ]);

  if (!short) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const channel = channels.find((c) => c.id === short.channel_id) ?? null;

  // The "shorts" storage bucket is private (RLS-scoped to channel
  // members — see migrations 0001/0006), so playback in the browser
  // needs a signed URL rather than a public one. Generated here with the
  // signed-in user's own session so it only succeeds if RLS actually
  // allows this user to read this file; 2 hours is generous for one
  // review session on this page without leaving stale long-lived links
  // around. A missing file (or any other Storage error) just means no
  // playback, not a broken page.
  let videoUrl: string | null = null;
  if (short.file_path) {
    const { data } = await supabase.storage
      .from("shorts")
      .createSignedUrl(short.file_path, 60 * 60 * 2);
    videoUrl = data?.signedUrl ?? null;
  }

  return (
    <ShortDetailClient
      short={short}
      channel={channel}
      reviews={reviews}
      altTitles={altTitles}
      currentUserEmail={user?.email ?? "you"}
      videoAiConfigured={!!process.env.GEMINI_API_KEY}
      videoUrl={videoUrl}
    />
  );
}
