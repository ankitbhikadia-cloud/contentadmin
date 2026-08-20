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

Schema lives in `supabase/migrations/`. Migrations were applied directly
to the `contentadmin` Supabase project; if you need to change the
schema, add a new migration file and apply it the same way (or via the
Supabase CLI once you have local dev set up).

Tables: `channels`, `channel_members`, `shorts`, `short_alt_titles`,
`reviews`, `upload_runs`, `import_batches`.

## Multi-user access

Logins don't share data by default. Every `channels` row (and, through
it, its shorts, imports, reviews, upload history, and the actual video
files in Storage) is only visible to the users listed in
`channel_members` for that channel — RLS enforces this on every table,
not just at the UI layer (see `supabase/migrations/0004_...` and
`0006_...`). Two logins signed into the same workspace genuinely can't
see each other's channels unless they're both members of the same one.

A channel can still have more than one member — the point isn't "one
channel, one user," it's "no accidental sharing." From `/channels` →
"Add a channel," entering a YouTube channel ID that's already registered
under an existing channel joins you as a co-member of that channel
(`create_or_join_channel`, a security-definer Postgres function) instead
of creating a disconnected duplicate — you land on the same real shorts,
history, and YouTube connection as whoever added it first. Every member
has equal permissions (edit, import, publish, add/remove other members);
there's no owner/collaborator distinction. A channel's card shows "Who
has access" with a "Remove access" / "Leave" button per member — removing
the last member is blocked (delete the channel instead, so nothing ends
up permanently unreachable from the app).

The Vercel Cron job (`/api/cron/publish-due`) uses a service-role client
and intentionally bypasses all of this — it publishes due shorts across
every channel regardless of membership, since it's the one thing that's
supposed to act on everyone's behalf. Everything reached through a
user's own session (every page, every "Publish now"/"Check now" click)
stays scoped to their channels.

**Backfill note:** when this was introduced, both existing logins
(`ankit.bhikadia@gmail.com` and `gopikakalathiya123@gmail.com`) were
added as members of every channel that existed at the time, since there
was no prior ownership data to migrate from and the app previously gave
every authenticated user full access anyway. Prune access for whichever
of those shouldn't actually have it from that channel's "Who has access"
list.

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
- **Auto-uploader**: `/api/cron/publish-due` runs on Vercel Cron once a
  day at 16:05 UTC (see `vercel.json`), publishing any `scheduled` short
  whose slot has passed, using a service-role Supabase client
  (`src/lib/supabase/service.ts`) since a cron request has no user
  session. Once a day, not more often, because **Vercel's Hobby plan
  caps cron jobs to daily** — `deploy_to_vercel` rejected this project
  outright with `cron_jobs_limits_reached` when the schedule was every
  15 minutes; upgrading to Pro would allow a tighter cadence. The
  Auto-uploader page also has a "Check now" button that runs the same
  logic on demand, for whenever once a day isn't fast enough.
- **Retries**: up to 3 attempts total per short (tracked via
  `upload_runs`, counted over a rolling 96-hour window so 3 once-daily
  cron attempts are still visible to the exhaustion check — see the
  comment in `src/lib/publish.ts`). After the 3rd failure the short
  flips to `failed` and its slot moves an hour out; re-publishing from
  there is a manual "Publish now," not automatic re-pickup. Manual
  "Publish now"/"Check now" clicks count toward the same 3 attempts, so
  retrying by hand gets you there faster than waiting on the daily cron.
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

**Plan constraint, confirmed:** Vercel's Hobby plan rejects any cron
schedule that runs more than once a day (`vercel.json` is set to daily
for that reason — see "Auto-uploader" above). `maxDuration = 300` on the
upload routes (shorts detail, queue, auto-uploader, the cron route
itself) hasn't hit a similar rejection yet, but the Hobby plan
historically caps function duration too — worth checking if a real
upload ever times out.
