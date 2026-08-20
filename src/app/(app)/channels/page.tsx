import { getChannels, getShorts, getChannelMembers } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const membersByChannel: Record<string, Awaited<ReturnType<typeof getChannelMembers>>> = {};
  await Promise.all(
    channels.map(async (c) => {
      membersByChannel[c.id] = await getChannelMembers(c.id);
    })
  );

  return (
    <ChannelsClient
      channels={channels}
      shortsCountByChannel={shortsCountByChannel}
      membersByChannel={membersByChannel}
      currentUserId={user?.id ?? null}
    />
  );
}
