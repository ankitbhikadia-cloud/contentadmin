import { getChannels, getShorts, QUEUE_STATUSES } from "@/lib/data";
import QueueClient from "./QueueClient";

export const dynamic = "force-dynamic";
// Bulk "Generate metadata" makes sequential Claude API calls — give it
// room beyond the default function timeout.
export const maxDuration = 300;

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ ch?: string }>;
}) {
  const { ch } = await searchParams;
  const [channels, shorts] = await Promise.all([
    getChannels(),
    getShorts({ channelId: ch ?? null, statuses: QUEUE_STATUSES }),
  ]);

  return <QueueClient shorts={shorts} channels={channels} activeChannel={ch ?? null} />;
}
