import { getChannels, getShorts } from "@/lib/data";
import ChannelsClient from "./ChannelsClient";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const [channels, shorts] = await Promise.all([getChannels(), getShorts()]);
  const shortsCountByChannel = shorts.reduce<Record<string, number>>(
    (acc, s) => {
      acc[s.channel_id] = (acc[s.channel_id] ?? 0) + 1;
      return acc;
    },
    {}
  );
  return (
    <ChannelsClient channels={channels} shortsCountByChannel={shortsCountByChannel} />
  );
}
