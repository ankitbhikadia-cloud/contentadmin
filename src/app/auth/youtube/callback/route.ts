import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/youtube";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const channelId = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/channels?error=${encodeURIComponent(oauthError)}`, request.url)
    );
  }
  if (!code || !channelId) {
    return NextResponse.redirect(new URL("/channels?error=missing_code", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Google only returns a refresh_token on first consent. If this
      // channel was connected before and the user re-consents without a
      // fresh "prompt=consent" (shouldn't happen since we always send
      // prompt=consent, but guard anyway), tell them plainly.
      throw new Error(
        "Google didn't return a refresh token. Try disconnecting and reconnecting this channel."
      );
    }
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const supabase = await createClient();
    const { error } = await supabase
      .from("channels")
      .update({
        youtube_access_token: tokens.access_token,
        youtube_refresh_token: tokens.refresh_token,
        youtube_token_expires_at: expiresAt,
        youtube_connected: true,
      })
      .eq("id", channelId);
    if (error) throw error;

    return NextResponse.redirect(new URL("/channels?connected=1", request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/channels?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
