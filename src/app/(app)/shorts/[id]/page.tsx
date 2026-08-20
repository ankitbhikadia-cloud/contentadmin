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

  return (
    <ShortDetailClient
      short={short}
      channel={channel}
      reviews={reviews}
      altTitles={altTitles}
      currentUserEmail={user?.email ?? "you"}
    />
  );
}
