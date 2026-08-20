import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/youtube";

// Protected by middleware (not in PUBLIC_PATHS) — only a signed-in user
// can start this flow. The callback's DB write is also RLS-gated to
// members of the channel, so this check is a UX nicety (fail before
// sending someone through Google's consent screen), not the real
// enforcement.
export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get("channel");
  if (!channelId) {
    return NextResponse.redirect(new URL("/channels?error=missing_channel", request.url));
  }
  try {
    const supabase = await createClient();
    const { data: isMember } = await supabase.rpc("is_channel_member", { cid: channelId });
    if (!isMember) {
      throw new Error("You don't have access to that channel.");
    }
    const url = buildAuthUrl(channelId);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/channels?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
