// Real video-aware AI drafting via the Gemini API's File API + generateContent.
// Claude's Messages API doesn't accept video input, so this is a separate
// provider used specifically so "Draft with AI" can actually look at the
// clip, not just the text signals around it (see src/lib/ai.ts for the
// original text-only path, which this sits alongside as a fallback when
// GEMINI_API_KEY isn't configured or the short has no video file yet).
//
// Uses the stable `generateContent` REST API (not the newer, still-Beta
// "Interactions API") per Google's own guidance for production use as of
// Aug 2026: https://ai.google.dev/gemini-api/docs/generate-content/video-understanding
//
// No SDK dependency — same reasoning as ai.ts: a direct fetch keeps this
// build's dependency surface small.

import { parseDraftedMetadataJson, type DraftedMetadata } from "@/lib/ai";

const FILES_BASE = "https://generativelanguage.googleapis.com/v1beta";
const UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.7-flash";
// Older, lower-demand Flash generation to fall back to if MODEL keeps
// getting 503'd — confirmed still current/stable on ai.google.dev as of
// Aug 2026, described there as "best price-performance...low-latency,
// high-volume," which is exactly the profile you want under load. Only
// used as a last resort after MODEL's own retries are exhausted (see
// generateContentWithRetry below), and only if it's actually different
// from MODEL — no point falling back to the same model.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

// How long to wait for Google to finish processing an uploaded video
// before giving up. Video processing time scales with length, but a
// vertical Short is at most ~60s of source video — this budget leaves
// room for that plus the upload/generateContent calls within the
// 300s maxDuration set on the pages that call this (see shorts/[id]/page.tsx).
const PROCESSING_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 4_000;

function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY isn't set. Add it in Vercel → Settings → Environment Variables (get one at aistudio.google.com/apikey) to enable video-aware AI drafting."
    );
  }
  return key;
}

type GeminiFile = { name: string; uri: string; state: string };

async function startResumableUpload(
  apiKey: string,
  byteLength: number,
  mimeType: string,
  displayName: string
): Promise<string> {
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini upload start failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const uploadUrl = res.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini upload start didn't return an upload URL.");
  }
  return uploadUrl;
}

async function finalizeUpload(
  uploadUrl: string,
  bytes: ArrayBuffer
): Promise<GeminiFile> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini upload finalize failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const file = json?.file;
  if (!file?.uri || !file?.name) {
    throw new Error("Gemini upload finalize response had no file uri/name.");
  }
  return { name: file.name, uri: file.uri, state: file.state ?? "PROCESSING" };
}

async function getFileState(apiKey: string, fileName: string): Promise<string> {
  const res = await fetch(`${FILES_BASE}/${fileName}`, {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini file status check failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json?.state ?? "UNKNOWN";
}

async function waitForActive(apiKey: string, fileName: string): Promise<void> {
  const deadline = Date.now() + PROCESSING_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await getFileState(apiKey, fileName);
    if (state === "ACTIVE") return;
    if (state === "FAILED") {
      throw new Error("Gemini failed to process the uploaded video.");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    "Gemini is still processing this video after 3 minutes — try \"Draft with AI\" again shortly."
  );
}

// Best-effort cleanup — Gemini auto-deletes uploaded files after 48h
// regardless, so a failure here is logged, not thrown.
async function deleteFile(apiKey: string, fileName: string): Promise<void> {
  try {
    await fetch(`${FILES_BASE}/${fileName}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": apiKey },
    });
  } catch (err) {
    console.error(`Gemini file cleanup failed for ${fileName}:`, err);
  }
}

// Gemini's own docs describe 503 UNAVAILABLE ("high demand") and 429
// RESOURCE_EXHAUSTED as transient — the recommended handling is a retry
// with backoff, not surfacing it as a hard failure. Everything else
// (4xx auth/validation errors, 500s that aren't the overload message)
// still throws immediately on the first attempt. They're handled the
// same way here rather than split apart: a 429 on this endpoint is
// per-minute request-rate throttling, not a hard monthly quota wall, so
// backing off and retrying the same key is still the right move — we
// don't run multi-key rotation, which is the only case where the two
// would need genuinely different handling.
const RETRYABLE_STATUSES = new Set([429, 503]);
// Exponential backoff with jitter: 3 retries beyond the initial attempt
// (4 attempts total), doubling from a 2s base, each with 0-1s of random
// jitter added so concurrent requests from this app don't all retry in
// lockstep against a recovering endpoint.
const RETRY_BASE_DELAY_MS = 2_000;
const MAX_RETRIES = 3;
const MAX_JITTER_MS = 1_000;
// Bound a single attempt so a hung connection to an overloaded endpoint
// can't quietly eat the whole request budget — an attempt that times
// out is treated as retryable, same as a 503. Sized, together with the
// numbers above, so the absolute worst case (every attempt times out,
// including the one fallback-model attempt) stays comfortably inside
// the budget left over after waitForActive's own 180s ceiling, within
// the 300s maxDuration on the pages that call this: 4 attempts x 15s +
// ~15s of backoff + one 15s fallback attempt ≈ 90s, vs. ~110s available.
const REQUEST_TIMEOUT_MS = 15_000;

class GeminiRequestError extends Error {
  constructor(public status: number | "timeout", message: string) {
    super(message);
  }
}

async function callGenerateContent(
  apiKey: string,
  model: string,
  body: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Gemini
  // response JSON; shape-checked by the caller before use.
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${FILES_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GeminiRequestError(
        "timeout",
        `Gemini generateContent (${model}) didn't respond within ${REQUEST_TIMEOUT_MS / 1000}s.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (res.ok) return res.json();
  const responseBody = await res.text().catch(() => "");
  throw new GeminiRequestError(
    res.status,
    `Gemini generateContent (${model}) failed (${res.status}): ${responseBody.slice(0, 300)}`
  );
}

function isRetryable(err: unknown): err is GeminiRequestError {
  return (
    err instanceof GeminiRequestError &&
    (err.status === "timeout" || RETRYABLE_STATUSES.has(err.status))
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see callGenerateContent
async function generateContentWithRetry(
  apiKey: string,
  body: Record<string, unknown>
): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGenerateContent(apiKey, MODEL, body);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES) break;
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * MAX_JITTER_MS;
      console.error(
        `Gemini generateContent (${MODEL}) got a retryable error, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
        err instanceof Error ? err.message : err
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // MODEL's own retries are exhausted. If it was a retryable condition
  // (sustained overload, not a bad key or malformed request) and a
  // distinct fallback model is configured, spend one more attempt there
  // before giving up entirely.
  if (isRetryable(lastError) && FALLBACK_MODEL !== MODEL) {
    console.error(
      `Gemini generateContent (${MODEL}) exhausted retries, falling back to ${FALLBACK_MODEL} for one attempt.`
    );
    try {
      return await callGenerateContent(apiKey, FALLBACK_MODEL, body);
    } catch (fallbackErr) {
      throw new Error(
        `Gemini generateContent failed on both ${MODEL} and fallback ${FALLBACK_MODEL}. ` +
          `Last error: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini generateContent failed for an unknown reason.");
}

export async function draftMetadataFromVideo(input: {
  videoBytes: ArrayBuffer;
  mimeType: string;
  fileDisplayName: string;
  currentTitle: string;
  currentDescription: string;
  channelName: string;
  channelCadence: string | null;
  existingTags: string[];
}): Promise<DraftedMetadata> {
  const apiKey = requireApiKey();

  const uploadUrl = await startResumableUpload(
    apiKey,
    input.videoBytes.byteLength,
    input.mimeType,
    input.fileDisplayName
  );
  const file = await finalizeUpload(uploadUrl, input.videoBytes);

  try {
    if (file.state !== "ACTIVE") {
      await waitForActive(apiKey, file.name);
    }

    const prompt = `You are drafting YouTube Shorts metadata for a channel called "${input.channelName}"${
      input.channelCadence ? ` (posts ${input.channelCadence})` : ""
    }. You've been given the actual video file — watch it and use what's really
shown/said, not just the filename or any existing title.

Additional known context (may be stale or a placeholder — trust the video over this):
- Current title: ${input.currentTitle || "(none)"}
- Current description: ${input.currentDescription || "(none)"}
- Existing tags: ${input.existingTags.length ? input.existingTags.join(", ") : "(none)"}

Respond with ONLY a JSON object (no markdown fences, no commentary) matching
this exact shape:
{
  "title": "string, <=100 chars, hooky but accurate to what's actually in the video",
  "description": "string, 1-3 sentences describing what actually happens/is said",
  "tags": ["array", "of", "5-10", "short", "lowercase", "keyword", "tags", "no", "#"],
  "altTitles": ["2-3 alternate title options"],
  "trendScore": integer 0-100 estimating hook/SEO strength given the actual content,
  "trendNote": "one short sentence explaining the score"
}`;

    const json = await generateContentWithRetry(apiKey, {
      contents: [
        {
          parts: [
            { file_data: { mime_type: input.mimeType, file_uri: file.uri } },
            { text: prompt },
          ],
        },
      ],
    });
    const parts: Array<{ text?: string }> = json?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((p) => typeof p?.text === "string")?.text;
    if (!text) {
      const finishReason = json?.candidates?.[0]?.finishReason ?? "unknown";
      throw new Error(
        `Gemini returned no text content (finishReason: ${finishReason}).`
      );
    }
    return parseDraftedMetadataJson(text);
  } finally {
    await deleteFile(apiKey, file.name);
  }
}
