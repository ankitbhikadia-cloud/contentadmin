import { getChannels } from "@/lib/data";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ ch?: string }>;
}) {
  const { ch } = await searchParams;
  const channels = await getChannels();
  return <ImportClient channels={channels} defaultChannelId={ch ?? channels[0]?.id ?? null} />;
}
