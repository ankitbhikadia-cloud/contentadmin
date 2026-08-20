// Real YouTube Data API v3 integration: OAuth connect + videos.insert
// publishing. No googleapis dependency — plain fetch, to keep this
// project's dependency surface small and avoid another build-risk
// package pin. See ContentAdmin-Plan.md for the Google Cloud setup this
// depends on (OAuth client ID/secret, API enabled, consent screen).

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";

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
