import { getChannels } from "@/lib/data";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";
// createShortsFromImport can run up to 10 sequential AI-draft calls when
// the "Draft on import" toggle is on (see src/lib/actions.ts) — without
// this, the action inherits Next.js's short default duration instead of
// the budget the other AI/upload-touching pages in this app set.
export const maxDuration = 300;

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ ch?: string }>;
}) {
  const { ch } = await searchParams;
  const channels = await getChannels();
  return <ImportClient channels={channels} defaultChannelId={ch ?? channels[0]?.id ?? null} />;
}
