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

    const res = await fetch(
      `${FILES_BASE}/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { file_data: { mime_type: input.mimeType, file_uri: file.uri } },
                { text: prompt },
              ],
            },
          ],
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini generateContent failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
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
