// Real YouTube Data API v3 integration: OAuth connect + videos.insert
// publishing. No googleapis dependency — plain fetch, to keep this
// project's dependency surface small and avoid another build-risk
// package pin. See ContentAdmin-Plan.md for the Google Cloud setup this
// depends on (OAuth client ID/secret, API enabled, consent screen).

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";
const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
].join(" ");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} isn't set. Add it in Vercel → Settings → Environment Variables.`
    );
  }
  return v;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

export function redirectUri(): string {
  return `${siteUrl()}/auth/youtube/callback`;
}

export function buildAuthUrl(channelId: string): string {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: channelId,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google token refresh failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

// YouTube's separate "tags" field is metadata only — it's never shown to
// viewers anywhere in the UI, only used for search/discovery. Hashtags
// actually written into the description (or title) are what's visible
// and clickable, and are what most creators mean by "add tags" in
// practice. Appended here rather than replacing the description, and
// skipped for a tag already present as a hashtag so re-syncing doesn't
// keep duplicating the same line.
export function withHashtags(description: string, tags: string[]): string {
  const toAdd = tags
    .map((t) => `#${t.replace(/^#/, "").replace(/\s+/g, "")}`)
    .filter((tag) => tag.length > 1 && !description.includes(tag));
  if (!toAdd.length) return description;
  const trimmed = description.trim();
  return trimmed ? `${trimmed}\n\n${toAdd.join(" ")}` : toAdd.join(" ");
}

export type YoutubeUploadMetadata = {
  title: string;
  description: string;
  tags: string[];
  privacyStatus: "public" | "unlisted" | "private";
  selfDeclaredMadeForKids: boolean;
  publishAt?: string | null; // ISO timestamp for scheduled publish
};

/**
 * Uploads a video buffer to YouTube via videos.insert (multipart upload).
 * Suitable for typical Shorts-sized files in a single request; there's no
 * chunked/resumable retry here, which is the tradeoff for keeping this a
 * single serverless invocation. See the auto-uploader page / plan doc for
 * the Vercel function-duration constraint this depends on.
 */
export async function uploadVideoToYoutube(
  accessToken: string,
  videoBytes: ArrayBuffer,
  mimeType: string,
  metadata: YoutubeUploadMetadata
): Promise<{ videoId: string }> {
  const boundary = `contentadmin-${Math.random().toString(36).slice(2)}`;
  const status: Record<string, unknown> = {
    privacyStatus: metadata.publishAt ? "private" : metadata.privacyStatus,
    selfDeclaredMadeForKids: metadata.selfDeclaredMadeForKids,
  };
  if (metadata.publishAt) status.publishAt = metadata.publishAt;

  const snippet = {
    title: metadata.title.slice(0, 100),
    description: metadata.description,
    tags: metadata.tags,
  };

  const metadataPart = JSON.stringify({ snippet, status });

  const preamble =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataPart}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const body = new Blob([preamble, videoBytes, closing]);

  const res = await fetch(YOUTUBE_UPLOAD_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`YouTube upload failed (${res.status}): ${errBody.slice(0, 500)}`);
  }

  const json = await res.json();
  if (!json.id) throw new Error("YouTube upload response had no video id.");
  return { videoId: json.id };
}

export type YoutubeVideoStatus = {
  privacyStatus: string;
  publishAt?: string;
  selfDeclaredMadeForKids?: boolean;
  [key: string]: unknown;
};

/**
 * Fetches a video's current `status` part. Used before rescheduling to
 * check whether it's already actually public — YouTube's own scheduled-
 * publish mechanism flips privacyStatus from "private" to "public" itself
 * once publishAt passes, and there's no undoing that back into a future
 * scheduled state, so a reschedule attempt on an already-public video
 * needs to be rejected with a clear reason rather than silently no-op'd
 * or sent to the API to fail unpredictably.
 */
export async function getVideoStatus(
  accessToken: string,
  videoId: string
): Promise<YoutubeVideoStatus | null> {
  const res = await fetch(
    `${YOUTUBE_VIDEOS_URL}?part=status&id=${encodeURIComponent(videoId)}`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube video status lookup failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const item = json?.items?.[0];
  if (!item) return null; // deleted/inaccessible on YouTube's side
  return item.status ?? null;
}

/**
 * Moves a video's scheduled publish time. videos.update replaces the
 * whole `status` part with whatever's sent, not a partial patch, so this
 * merges the new publishAt into the status YouTube already has (fetched
 * by the caller via getVideoStatus) instead of sending a bare
 * {publishAt} that would silently reset privacyStatus/madeForKids to
 * API defaults.
 */
export async function updateScheduledPublishTime(
  accessToken: string,
  videoId: string,
  currentStatus: YoutubeVideoStatus,
  publishAt: string
): Promise<void> {
  const res = await fetch(`${YOUTUBE_VIDEOS_URL}?part=status`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: videoId,
      status: { ...currentStatus, privacyStatus: "private", publishAt },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube reschedule failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

export type YoutubeVideoSnippet = {
  title: string;
  description: string;
  tags?: string[];
  categoryId: string;
  [key: string]: unknown;
};

/**
 * Fetches a video's current `snippet` part. Needed before updating it —
 * see updateVideoSnippet — since videos.update replaces the whole part,
 * and categoryId in particular is required by the API but isn't
 * something this app tracks, so it has to come from what YouTube
 * already has rather than being invented here.
 */
export async function getVideoSnippet(
  accessToken: string,
  videoId: string
): Promise<YoutubeVideoSnippet | null> {
  const res = await fetch(
    `${YOUTUBE_VIDEOS_URL}?part=snippet&id=${encodeURIComponent(videoId)}`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube video snippet lookup failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const item = json?.items?.[0];
  if (!item) return null;
  return item.snippet ?? null;
}

/**
 * Pushes this app's current title/description/tags to an already-
 * uploaded video — used by "Sync to YouTube" for a live short whose
 * metadata changed after it was published (e.g. tags added by "Draft
 * with AI" after the fact, or a manual edit). Merges into the existing
 * snippet rather than sending a bare {title, description, tags}, for
 * the same reason as updateScheduledPublishTime above.
 */
export async function updateVideoSnippet(
  accessToken: string,
  videoId: string,
  currentSnippet: YoutubeVideoSnippet,
  updates: { title: string; description: string; tags: string[] }
): Promise<void> {
  const res = await fetch(`${YOUTUBE_VIDEOS_URL}?part=snippet`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: videoId,
      snippet: {
        ...currentSnippet,
        title: updates.title.slice(0, 100),
        description: updates.description,
        tags: updates.tags,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube snippet update failed (${res.status}): ${body.slice(0, 300)}`);
  }
}
