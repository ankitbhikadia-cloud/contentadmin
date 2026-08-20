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

  // Defensive: getChannelMembers throws if the RPC decides this user
  // isn't actually a member of a channel (see get_channel_members in
  // supabase/migrations/0004_...). That should never happen for a
  // channel getChannels() just returned — RLS on `channels` and the
  // RPC's own check both key off is_channel_member — but a stale RLS
  // policy previously made exactly that mismatch possible in production
  // (fixed in migration 0007) and took the whole page down with it. One
  // channel's member list failing to load shouldn't do that again.
  const membersByChannel: Record<string, Awaited<ReturnType<typeof getChannelMembers>>> = {};
  await Promise.all(
    channels.map(async (c) => {
      try {
        membersByChannel[c.id] = await getChannelMembers(c.id);
      } catch (err) {
        console.error(`Failed to load members for channel ${c.id}:`, err);
        membersByChannel[c.id] = [];
      }
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
