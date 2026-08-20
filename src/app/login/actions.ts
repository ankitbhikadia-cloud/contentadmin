"use server";

import { createClient } from "@/lib/supabase/server";

export type SendLinkResult = { ok: true } | { ok: false; error: string };

export async function sendMagicLink(email: string): Promise<SendLinkResult> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: "Enter an email address." };

  const supabase = await createClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
