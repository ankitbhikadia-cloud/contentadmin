import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { publishShort } from "@/lib/publish";

// Runs on Vercel Cron (see vercel.json) every 15 minutes, publishing any
// scheduled short whose slot_at has passed on a connected channel. Uses
// the service-role client (see src/lib/supabase/service.ts) since a cron
// request has no user session, so the normal cookie-based/RLS-scoped
// client would see nothing.
//
// Protected by CRON_SECRET so this can't be triggered by anyone who finds
// the URL — Vercel Cron sends this automatically as a bearer token, or
// you can hit it manually with `?secret=...` while testing.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization");
    const querySecret = request.nextUrl.searchParams.get("secret");
    const authorized =
      authHeader === `Bearer ${secret}` || querySecret === secret;
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Service client unavailable" },
      { status: 500 }
    );
  }

  const { data: due, error } = await supabase
    .from("shorts")
    .select("id, title")
    .eq("status", "scheduled")
    .lte("slot_at", new Date().toISOString())
    .order("slot_at", { ascending: true })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  for (const short of due ?? []) {
    const result = await publishShort(supabase, short.id);
    results.push({ id: short.id, title: short.title, ...result });
  }

  return NextResponse.json({ checked: due?.length ?? 0, results });
}
