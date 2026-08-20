import { getChannels, getShorts } from "@/lib/data";
import QueueClient from "./QueueClient";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ ch?: string }>;
}) {
  const { ch } = await searchParams;
  const [channels, shorts] = await Promise.all([
    getChannels(),
    getShorts({ channelId: ch ?? null }),
  ]);

  return <QueueClient shorts={shorts} channels={channels} activeChannel={ch ?? null} />;
}
