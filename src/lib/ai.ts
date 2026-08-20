// Real AI metadata drafting via the Claude API. No SDK dependency — a
// direct fetch keeps this build's dependency surface (and risk) small.
//
// Honest scope note: this drafts from the text signals we actually have
// (current title/filename, any description already typed, the channel's
// name/cadence) — it does not watch the video or transcribe audio, which
// would need a separate media pipeline (ffmpeg + a transcription service)
// that isn't built. Metadata quality depends on how much real context you
// give it before drafting — a one-line note in the title/description
// before hitting "Draft with AI" goes a long way.

export type DraftedMetadata = {
  title: string;
  description: string;
  tags: string[];
  altTitles: string[];
  trendScore: number;
  trendNote: string;
};

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export async function draftShortMetadata(input: {
  currentTitle: string;
  currentDescription: string;
  fileName: string | null;
  channelName: string;
  channelCadence: string | null;
  existingTags: string[];
}): Promise<DraftedMetadata> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY isn't set. Add it in Vercel → Settings → Environment Variables to enable AI drafting."
    );
  }

  const prompt = `You are drafting YouTube Shorts metadata for a channel called "${input.channelName}"${
    input.channelCadence ? ` (posts ${input.channelCadence})` : ""
  }.

Here's what's known about this specific clip:
- Current title: ${input.currentTitle || "(none)"}
- Current description: ${input.currentDescription || "(none)"}
- Original filename: ${input.fileName || "(unknown)"}
- Existing tags: ${input.existingTags.length ? input.existingTags.join(", ") : "(none)"}

This is limited, real information — you have not watched the video. Draft
the best metadata you reasonably can from these signals, and keep the
tone honest (a generic, safe title beats an invented, overly-specific
claim about content you can't verify).

Respond with ONLY a JSON object (no markdown fences, no commentary) matching
this exact shape:
{
  "title": "string, <=100 chars, hooky but accurate",
  "description": "string, 1-3 sentences",
  "tags": ["array", "of", "5-10", "short", "lowercase", "keyword", "tags", "no", "#"],
  "altTitles": ["2-3 alternate title options"],
  "trendScore": integer 0-100 estimating hook/SEO strength given only these signals,
  "trendNote": "one short sentence explaining the score, e.g. what would make it stronger"
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Claude API request failed (${res.status}): ${body.slice(0, 300)}`
    );
  }

  const json = await res.json();
  const text: string | undefined = json?.content?.[0]?.text;
  if (!text) throw new Error("Claude API returned no content.");

  let parsed: unknown;
  try {
    // Strip accidental markdown fences just in case the model adds them.
    const cleaned = text.trim().replace(/^```json\s*|```$/g, "");
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Claude API response wasn't valid JSON.");
  }

  const p = parsed as Partial<DraftedMetadata>;
  if (typeof p.title !== "string" || typeof p.description !== "string") {
    throw new Error("Claude API response was missing required fields.");
  }

  return {
    title: p.title.slice(0, 100),
    description: p.description,
    tags: Array.isArray(p.tags) ? p.tags.slice(0, 15).map(String) : [],
    altTitles: Array.isArray(p.altTitles)
      ? p.altTitles.slice(0, 3).map(String)
      : [],
    trendScore:
      typeof p.trendScore === "number"
        ? Math.max(0, Math.min(100, Math.round(p.trendScore)))
        : 50,
    trendNote: typeof p.trendNote === "string" ? p.trendNote : "",
  };
}
