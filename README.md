# ContentAdmin

Organize YouTube Shorts uploads and scheduling across multiple channels —
built from the "Organic" ContentAdmin design.

See `ContentAdmin-Plan.md` (in the project) for the full phased plan. The
app is fully wired end to end: auth, channel management, import, queue,
calendar, video detail, and reviewer notes on a real Supabase database;
AI-drafted metadata and trend scoring via the Claude API; and real
YouTube publishing via OAuth + the YouTube Data API, including a
scheduled auto-uploader. Nothing in the app is mocked or a dead
scaffold — every button either does the real thing or explains what env
var/setup step it's waiting on.

## Stack

- [Next.js 14](https://nextjs.org) (App Router, TypeScript)
- [Supabase](https://supabase.com) — Postgres, Auth (magic link), Storage
- Deployed on [Vercel](https://vercel.com)
- No CSS framework — the "Organic" design system's tokens/components are
  ported directly into `src/app/globals.css`

## Local development

```bash
npm install
cp .env.example .env.local   # already has the contentadmin project's URL + anon key
npm run dev
```

Open http://localhost:3000. Sign in with any email — Supabase sends a
magic link (check the Supabase Auth logs in the dashboard if email
sending isn't configured yet for the project).

## Database

Schema lives in `supabase/migrations/0001_init.sql`. It was applied
directly to the `contentadmin` Supabase project; if you need to change
it, add a new migration file and apply it the same way (or via the
Supabase CLI once you have local dev set up).

Tables: `channels`, `shorts`, `short_alt_titles`, `reviews`,
`upload_runs`, `import_batches`. RLS is enabled everywhere — any
authenticated user has full access (this is an internal team tool, not
multi-tenant).

## AI-drafted metadata

"Draft with AI" (on a short's detail page), the Queue's bulk "Generate
metadata," and Import's "Draft titles… on import" toggle all call the
real Claude API (`src/lib/ai.ts`) with the text signals actually
available — current title/description, original filename, channel name
and cadence. It returns a title, description, tags, 2–3 alt-title
options, and a 0–100 trend score with a one-line note (an AI estimate of
hook/SEO strength from those signals — it doesn't watch the video).
Requires `ANTHROPIC_API_KEY`.

## Real YouTube publishing

Each channel connects to YouTube individually via OAuth
(`/channels` → "Connect to YouTube", or from the Auto-uploader page).
That flow, the token refresh, and the actual upload
(`videos.insert`, multipart) live in `src/lib/youtube.ts` and
`src/lib/publish.ts` — no `googleapis` dependency, plain `fetch`.

- **Manual publish**: a short's detail page gets a real "Publish now"
  button once its channel is connected.
- **Auto-uploader**: `/api/cron/publish-due` runs on Vercel Cron every 15
  minutes (see `vercel.json`), publishing any `scheduled` short whose
  slot has passed, using a service-role Supabase client
  (`src/lib/supabase/service.ts`) since a cron request has no user
  session. The Auto-uploader page also has a "Check now" button that
  runs the same logic on demand.
- **Retries**: up to 3 attempts total per short (tracked via
  `upload_runs`, not a precise timer — retries happen on the cron's own
  15-minute cadence). After the 3rd failure the short flips to `failed`
  and its slot moves an hour out; re-publishing from there is a manual
  "Publish now," not automatic re-pickup.
- Requires a Google Cloud OAuth client (YouTube Data API v3 enabled,
  OAuth consent screen with the `youtube.upload` and `youtube.force-ssl`
  scopes, redirect URI `{NEXT_PUBLIC_SITE_URL}/auth/youtube/callback`).
  **While that consent screen is in "Testing" mode, YouTube restricts
  uploads from it to private** — plan for Google's verification review
  before relying on public/scheduled uploads in production.

## Deployment

Connected to Vercel project `contentadmin` (team: Ankit's projects).
Environment variables needed on Vercel — see `.env.example` for the full
list with descriptions:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` — the deployed URL, used for the magic-link
  redirect and the YouTube OAuth `redirect_uri`
- `SUPABASE_SERVICE_ROLE_KEY` — for the publish-due cron job
- `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) — for AI drafting
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for YouTube OAuth
- `CRON_SECRET` (optional but recommended) — protects
  `/api/cron/publish-due` from unauthenticated triggers

**Plan constraints to check before relying on this in production:** Vercel
Cron's minimum interval and the `maxDuration = 300` set on the upload
routes (shorts detail, queue, auto-uploader, the cron route itself) may
both need a paid Vercel plan — the Hobby plan historically caps both cron
frequency and function duration below what's configured here.
