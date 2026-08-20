import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl } from "@/lib/youtube";

// Protected by middleware (not in PUBLIC_PATHS) — only a signed-in user
// can start this flow.
export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get("channel");
  if (!channelId) {
    return NextResponse.redirect(new URL("/channels?error=missing_channel", request.url));
  }
  try {
    const url = buildAuthUrl(channelId);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/channels?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
