# ContentAdmin — Plan

*A tool to organize YouTube Shorts uploads and scheduling across multiple channels, built from the "Organic" design mockup you shared.*

## What the design shows

The mockup is a multi-channel Shorts pipeline with five screens, all sharing a sidebar (channel switcher + Dashboard / Queue / Calendar / Import / Auto-uploader nav):

- **Dashboard** — today's send-out list, week strip, four stat tiles (scheduled / waiting on review / went live / failed), an "AI wrote 31 of 47 descriptions" callout.
- **Queue** — every short across channels, as a table or a kanban board (Draft → Needs review → Approved → Out), with bulk actions (generate metadata, approve, spread across calendar) and per-channel filtering via the sidebar.
- **Calendar** — a month grid; an "Inbox" of unslotted shorts you drag onto a day, or auto-slot into the channel's best posting times.
- **Video detail** — preview thumbnail, a trend/SEO-fit score, editable title/description/tags with AI-drafted alternates, visibility/playlist/kids/comments settings, slot info, and a reviewer comment thread with an approve action.
- **Import** — drop a folder or pull from a Drive link; per-batch presets (channel, spread window, "draft with AI", "send to reviewer") applied to every clip; a run list showing per-clip metadata status.
- **Auto-uploader** — on/off toggle, a live run log per video (uploading / queued / held / failed / live) with retry, and a plain-language failure policy (two retries, then hold the slot an hour).

Everything in the mockup runs on fake in-browser state (`videos`, `channels`, `inboxItems` arrays) — there's no real backend, auth, storage, or YouTube connection yet. That's the gap this plan closes.

## One deviation from the mockup, on purpose

The Auto-uploader copy says *"a browser session signs in and posts each approved short."* I'm not going to build it that way — a bot that logs into a YouTube account by entering credentials/cookies on a schedule is fragile, breaks on any 2FA/CAPTCHA change, and risks the channel's standing with YouTube.

The real, supported way to do this is the **YouTube Data API v3**: each channel owner does a one-time OAuth consent (click "Connect this channel," approve on Google's real sign-in page — I never see or handle the password), we store the refresh token, and uploads happen via `videos.insert` at the scheduled slot, using YouTube's own `publishAt` scheduling. Same UI, same run log, same retry/failure story — just a durable mechanism underneath instead of a browser puppet. Flagging this since it's the one place I'm intentionally not pixel-matching the mockup's *implementation* (the UI and UX stay the same).

## Proposed scope, phased

**Phase 1 — the real app, manual metadata (buildable now, no external API keys beyond Supabase/Vercel)**
- Auth (Supabase Auth) + multi-channel workspace
- Import: upload files to Supabase Storage (folder drop; "pull from Drive" deferred — needs a Google Drive OAuth scope, see open questions)
- Queue (table + board), Calendar with real drag-to-slot, Video detail with manual title/description/tags/settings editing
- Reviewer comments + approve flow
- Dashboard stats computed from real data
- No AI drafting yet, no real YouTube publish yet — slots just sit as "Approved" until Phase 3 lands

**Phase 2 — AI-drafted metadata**
- On import or on-demand: send the clip (or a transcript/frame sample) to Claude to draft title/description/tags + 2-3 title alternates, same as the mockup's "Draft with AI" flow
- Needs an `ANTHROPIC_API_KEY`

**Phase 3 — real YouTube publishing**
- Per-channel OAuth connect (YouTube Data API v3), refresh-token storage, scheduled `videos.insert` at slot time via a cron job (Vercel Cron or Supabase Edge Function), run log + retry exactly like the mockup
- Needs a Google Cloud project with YouTube Data API enabled + OAuth client (you'd create this — I can walk you through it when we get there)

I'd suggest building and shipping Phase 1 first so you have a working tool, then layering in AI drafting and real publishing once the core is solid.

## Data model (Postgres / Supabase)

- `channels` — id, name, youtube_channel_id (nullable until Phase 3), subscriber_count, cadence, accent color
- `shorts` — id, channel_id, title, description, tags[], file path (Storage), duration, status (draft/needs_review/approved/scheduled/live/failed), slot_at, visibility, playlist, made_for_kids, allow_comments, trend_score
- `short_alt_titles` — short_id, text (AI alternates)
- `reviews` — short_id, author, body, created_at
- `upload_runs` — short_id, state (queued/uploading/held/failed/live), progress_pct, attempted_at, error_message
- `import_batches` — id, channel_id, preset (spread window, ai draft on/off, review on/off), created_at

## Stack

- **Frontend/backend**: Next.js (App Router, TypeScript), deployed on **Vercel** (team: *Ankit's projects*)
- **Database/Auth/Storage**: **Supabase** — I'd create a new project named `contentadmin` (org: *Ledgr*, your only Supabase org — let me know if you'd rather a different org/new one)
- **Styling**: Tailwind, with the mockup's "Organic" design tokens (cream/terracotta/sage, Caprasimo + Figtree, 16px→pill radii) ported into `tailwind.config` / CSS variables so the build matches the mockup exactly
- **Repo**: GitHub, pushed from here once the connector is live in this chat (see below)

## Open questions before I start building

1. **GitHub** — still not showing as connected in this chat even after you enabled it; could you double check Settings → Connectors → this conversation's toggles? Otherwise I'll build everything here and hand you a ready-to-push folder.
2. **Supabase org** — use *Ledgr* (only org on the account) or set up a separate one for this project?
3. **"Pull from Drive"** — real Google Drive picker (needs its own OAuth scope + Google Cloud setup) or drop this for now and rely on direct file upload?
4. **Phase 1 go-ahead** — OK to create the GitHub repo, Supabase project (this provisions real infra, typically free tier but I'll show you the cost confirmation before creating it), and Vercel project now and start scaffolding, or want to adjust scope first?

## Status (2026-08-19)

You said go ahead on Phase 1 with the real YouTube Data API approach for
the auto-uploader (not the browser-bot version). Here's where things
landed:

**Done:**
- **Supabase** — new project `contentadmin` is live (org: Ledgr, project
  ref `pfgrbkaloadwgtumkali`, region us-east-1, free tier). Schema
  applied: `channels`, `shorts`, `short_alt_titles`, `reviews`,
  `upload_runs`, `import_batches`, all with RLS (any authenticated user
  has full access — internal tool, not multi-tenant), plus a private
  `shorts` Storage bucket. Seeded with the three channels from the
  design (Desk Reset Daily, Money in Minutes, Mindful Minute).
- **App code** — the full Phase 1 Next.js app is written: magic-link
  auth, Dashboard, Queue (table + board), Calendar (real drag-to-slot),
  video detail (manual metadata editing + reviewer notes), Import
  (uploads to Supabase Storage). No Tailwind — the Organic design
  system's actual tokens/CSS were ported directly so it matches the
  mockup. Sent to you as `contentadmin.zip` and saved in your workspace
  folder as `contentadmin.zip`.

**Blocked — need your help:**
- **Vercel** — `deploy_to_vercel` fails with a 403 "You don't have
  permission to create a Production/Preview Deployment" for both
  targets, and the `contentadmin` project never actually persisted
  (`get_project` 404s right after "success"). This looks like a
  permission/role or plan restriction on the Vercel account tied to
  this session (e.g. the connected account isn't an Owner, or the team
  plan restricts creating new projects via the API). Your other
  projects (ledgre, finance-app, claw-ease, sidequestors) are all
  visible and readable fine, so it's specifically project *creation*
  that's blocked.
- **GitHub** — the connector still isn't showing as enabled in this
  chat even after you said you connected it. No repo has been created
  or pushed.

**What would unblock this:**
1. For Vercel: either check your role/permissions on the *Ankit's
   projects* team (Settings → Members), or just create an empty project
   named `contentadmin` yourself in the Vercel dashboard — once it
   exists I may be able to deploy into it, or you can `vercel
   deploy`/import from the zip yourself.
2. For GitHub: re-check that the GitHub connector is toggled on for
   *this specific chat* (Settings → Connectors), not just connected at
   the account level.

Once either is unblocked, say so and I'll pick this back up — the app
itself is done and just needs somewhere to land.

## Status (2026-08-20, later) — shipped and live

Both blockers cleared. GitHub push went through the user's local machine
(this sandbox's git proxy only allows pushes to pre-authorized repos, so
code changes get handed over as files and pushed locally — see below).
Vercel deployed successfully via `create_git_project` once the repo
existed. Live at **https://contentadmin.vercel.app**.

Along the way, fixed a real build bug: `@supabase/ssr` was pinned to a
stale `^0.5.2` while `@supabase/supabase-js` resolved much newer, which
broke `.update()`/`.insert()` type inference (`never` errors) on Vercel's
build. Bumped `@supabase/ssr` to `^0.10.0` and replaced the hand-written
`database.types.ts` with Supabase's officially generated types.

**Channel management added** (`/channels` page + `createChannel` /
`updateChannel` / `deleteChannel` server actions). Previously channels
only existed via the seed migration — now there's a real UI to add,
edit, and delete them, linked from the sidebar ("+ Add / manage
channels"). Two of the three seeded mock channels ("Money in Minutes",
"Mindful Minute") were removed since they had zero real data. **"Desk
Reset Daily" was deliberately left in place** — 3 real Shorts were
imported against it during testing — rename it to your actual channel
name from the Channels page rather than deleting it, to avoid losing
that test data.

**Development workflow note:** this sandbox can't push to GitHub
directly (proxy restricts pushes to pre-authorized repos regardless of
PAT). The working pattern going forward: edits happen here, get written
into the user's local clone via the device bridge
(`/Users/ankitbhikadia/workspace/contentadmin`), and the user runs
`git add -A && git commit && git push` locally. Vercel auto-deploys on
push to `master`; env vars (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`) are set in the
Vercel dashboard and were a one-time setup step.

### Audit: what's real vs. mocked/stubbed right now

**Real and DB-backed:** auth (magic link), channels (now full CRUD),
import (real Storage upload + real `shorts` rows), queue (table/board,
bulk approve), calendar (real drag-to-slot, auto-slot), video detail
(title/description/tags/settings editing, reviewer notes), dashboard
stats.

**Honest placeholders (labeled as not-built-yet in the UI, not fake
data):**
- Queue's "Generate metadata" bulk button — disabled, needs an AI
  provider integration (Phase 2).
- Video detail's "Draft with AI" button — disabled, same as above.
- Video detail's "Trend read" card — static copy; `trend_score` /
  `trend_note` columns exist in the schema but nothing ever sets or
  reads them yet.
- Auto-uploader page — "Not connected yet" / disabled "Connect this
  channel" buttons; needs YouTube OAuth (Phase 3) plus a real
  upload/publish job runner with retry logic. `upload_runs` table
  exists but nothing ever inserts into it yet.
- Dashboard's "AI wrote N of M descriptions" callout — the math is real
  (`metadata_source === "ai"`), but nothing ever sets `metadata_source`
  to `"ai"` yet, so it always reads 0 until Phase 2 lands.

**Dead scaffold (defined in the schema/types but unused end-to-end,
no UI at all):**
- `short_alt_titles` table + `getAltTitles()` — never called from any
  page.
- `import_batches` table — never inserted into or read anywhere,
  despite the Import page mentioning per-batch presets in the plan.

These two are fine to leave as-is until Phase 2 (AI alt-titles) and a
richer Import flow (batch presets) actually use them — flagging so
they're not mistaken for bugs.

## Status (2026-08-20, later still) — everything real now

You said: make everything real, nothing mocked/scaffold/fake, ask
questions if needed. Asked three questions up front (AI provider →
Claude API; when to set up YouTube OAuth → now; what "trend score"
means → AI-estimated hook/SEO score) and built out every item from the
audit above against those answers. Nothing below is a placeholder.

**AI-drafted metadata (`src/lib/ai.ts`)** — real Claude API calls (plain
`fetch`, no SDK; model configurable via `ANTHROPIC_MODEL`, defaults to
`claude-sonnet-5`). Drafts title/description/tags/2-3 alt titles/trend
score+note from the real signals available (current title, description,
filename, channel name/cadence) — it does not watch the video. Wired
into: "Draft with AI" on a short's detail page, Queue's bulk "Generate
metadata" (capped at 10 per click), and a new "Draft on import" toggle
on the Import page. `short_alt_titles` (previously dead) now gets real
rows, shown as a clickable "AI alt titles" card. `trend_score`/
`trend_note` (previously unused columns) now populate a real "Trend
read" card.

**Real YouTube publishing (`src/lib/youtube.ts`, `src/lib/publish.ts`)**
— per-channel OAuth connect/disconnect (Channels page and Auto-uploader
page both link into it), real `videos.insert` upload (multipart, no
`googleapis` dependency), real token refresh, and a real retry policy:
3 attempts total tracked via `upload_runs` (previously dead — nothing
ever inserted into it; now every attempt does), then the short flips to
`failed` and its slot holds for an hour. Two publish paths share this
logic: an interactive "Publish now" button (any signed-in user's
session) and `/api/cron/publish-due` on a 15-minute Vercel Cron
schedule (`vercel.json`, new), using a service-role Supabase client
(`src/lib/supabase/service.ts`, new) since a cron request has no user
session — plus a manual "Check now" button on the Auto-uploader page for
testing that path without waiting for the schedule.

**Import batch settings** — the Import page previously always created
plain, unscheduled drafts. It now has real controls: spread new clips'
slots across N days (round-robin, fixed 16:00 UTC), optionally send
straight to "needs review" instead of "draft," and optionally trigger AI
drafting on import. `import_batches` (previously dead) now gets a real
row per import recording those choices.

**Security/correctness fixes made along the way (caught before
shipping, not bug reports from you):**
- `getChannels()` now redacts `youtube_access_token`/
  `youtube_refresh_token` to `null` before returning — those flow into
  several client components (Sidebar, Channels, Import, Auto-uploader)
  and must never reach the browser. A separate `getChannelTokens()`
  reads the real values, only from server-only code that immediately
  uses them.
- The auth middleware was redirecting *every* unauthenticated request to
  `/login`, including Vercel Cron's bearer-token request to
  `/api/cron/publish-due` — which would have silently broken the entire
  auto-uploader (the route's own `CRON_SECRET` check would never even
  run). Added `/api/cron` to the middleware's public-path allowlist; the
  route's own secret check still gates it.
- Auto-uploader copy originally implied a failed-and-exhausted short
  becomes eligible again automatically — traced the actual query logic
  and corrected it: re-publishing after 3 failed attempts is a manual
  "Publish now," not automatic re-pickup.

**New required env vars** (see `.env.example` and the README's
Deployment section for the full list): `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`), `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and optional `CRON_SECRET`.

**Known constraint, not yet resolved:** the Google OAuth consent screen
is in "Testing" mode, which caps YouTube uploads from it to private
regardless of the `visibility` setting on a short — Google's
verification review needs to complete before public/scheduled uploads
actually go out as configured.

## Status (2026-08-20, later still again) — deploy was silently blocked by the cron limit

After pushing the "make everything real" round above, the deployment
never actually landed — Vercel kept rebuilding the *old* pre-YouTube
commit every time you clicked Redeploy, and no new deployment ever
appeared for the new commits at all, not even as a failed one in the
list. Root cause, found by trying `create_git_project` directly: your
Vercel account is on the **Hobby plan, which rejects any cron schedule
that runs more than once a day** — `vercel.json`'s `*/15 * * * *` was
being rejected at deployment-creation time with
`cron_jobs_limits_reached`, before a deployment object even existed to
show up as an error.

You picked "drop to once-daily cron" over upgrading to Pro or dropping
automatic publishing entirely. Changed `vercel.json` to `5 16 * * *`
(16:05 UTC daily — 5 minutes after the fixed 16:00 UTC slot time Import
uses for spread-days scheduling, so same-day scheduled shorts get
picked up promptly). Also widened the retry-exhaustion lookback window
in `src/lib/publish.ts` from 1 hour to 96 hours — with a daily cron, a
1-hour window would never see more than one attempt at a time, so a
broken short would just retry forever instead of ever reaching "3
attempts, then hold." Manual "Publish now"/"Check now" clicks still
count toward the same 3-attempt limit, so retrying by hand is still the
fast path. Auto-uploader page copy, the cron route's comments, and the
README were all updated to describe the daily cadence accurately rather
than the originally-planned 15-minute one.

If you want the tighter cadence back later, upgrading the Vercel team to
Pro and reverting `vercel.json`'s schedule to `*/15 * * * *` is the
whole change.

## Status (2026-08-20, evening) — per-user channel access, real multi-tenancy

You flagged that videos shouldn't be shared across logins, with the
twist that a single real YouTube channel can still have more than one
app user attached to it. Confirmed via `auth.users` there are genuinely
two logins on this project already
(`ankit.bhikadia@gmail.com`, `gopikakalathiya123@gmail.com`), so this
wasn't hypothetical.

Before building, asked and got two decisions: (1) adding a channel with
a YouTube channel ID that's already registered auto-joins you as a
co-member rather than requiring approval or creating a duplicate, and
(2) all members of a channel get equal permissions — no owner role.

What changed, end to end — not just the database:

- New `channel_members` table + a `create_or_join_channel` security-
  definer Postgres function that atomically creates-or-joins so a
  channel can never end up with zero members (migration `0004`).
- RLS on `channels`, `shorts`, `short_alt_titles`, `reviews`,
  `upload_runs`, and `import_batches` rewritten from "any authenticated
  user" to membership-scoped, via `is_channel_member`/`is_short_member`
  helper functions (also `0004`). Locked the new functions' grants down
  to `authenticated` only in `0005` — Postgres grants EXECUTE to PUBLIC
  by default, which would've included the unauthenticated `anon` role.
- **Caught before shipping**: the actual video files in the `shorts`
  Storage bucket had no per-channel restriction at all — any
  authenticated user could read/write/delete any file regardless of
  channel, since the bucket's RLS only checked `bucket_id = 'shorts'`.
  This was the literal thing you asked about ("this videos should not be
  shared"), not just the metadata rows, so fixed it the same way,
  scoping by the channel-ID folder prefix in each object's path
  (migration `0006`).
- `create_or_join_channel` also picked up the dedup logic: matching by
  `youtube_channel_id` (now unique where non-null) to decide join vs.
  create.
- Channels page: new "Who has access" list per channel with
  "Remove access" / "Leave" per member (`removeChannelMember`, blocked
  from removing the last member), and a message when "Add a channel"
  joined an existing one instead of creating a duplicate.
- Caught two edge cases in the OAuth connect flow while reviewing it
  against the new RLS: the callback's channel `.update()` would have
  silently no-op'd (0 rows, no thrown error) for someone hitting
  `/auth/youtube/connect?channel=<id>` on a channel they're not a member
  of, falsely redirecting to `?connected=1`. Added a membership check up
  front in the connect route (fails fast, before sending them through
  Google) and made the callback's write detect and surface a real error
  instead of a false success.
- Backfilled: both existing logins were added as members of every
  channel that existed before this change, since there's no prior
  ownership data and the app previously gave every authenticated user
  full access anyway. Prune from "Who has access" on the Channels page
  for whichever of the two shouldn't actually have it.

Nice side effect, no code change needed: `getDueShorts`/`checkAndPublishDue`
("Check now") already used the caller's own session client, so it's now
correctly scoped to just that user's channels automatically — only the
daily cron (service-role client, intentionally) still acts across
everyone.

### Caught right after shipping: the RLS rewrite hadn't actually applied

You removed `gopikakalathiya123@gmail.com` from the one existing channel
via the new "Remove access" button, then logged in as her and hit a
server error on `/channels` (digest `2411531117`). `get_runtime_errors`
showed the real Postgres error underneath: `P0001 "Not a member of this
channel"` — thrown by `get_channel_members`, correctly, for a channel
`getChannels()` had just handed back to her anyway.

Root cause: migration `0004`'s `drop policy if exists "..." on channels`
(and 5 other tables) guessed at the original policy's name from
`0001_init.sql` — three guesses, none right. `DROP POLICY IF EXISTS`
doesn't error on a non-matching name, it just silently does nothing, so
the real policy (`"authenticated full access"`, `ALL`, `qual: true`)
stayed active this entire time. Postgres RLS policies are OR'd together,
so that one permissive policy alone kept every row on `channels`,
`shorts`, `short_alt_titles`, `reviews`, `upload_runs`, and
`import_batches` visible to every authenticated user regardless of the
new membership policies sitting right next to it — the entire per-user
access change had been a no-op on every table except `channel_members`
and the Storage bucket (those two used their real names, confirmed by
querying `pg_policies` before writing that migration, which is exactly
why they didn't have this bug).

Confirmed the real policy name by querying `pg_policies` directly rather
than guessing again, then dropped it for real (migration `0007`).
Re-queried `pg_policies` afterward to confirm only the intended
membership-scoped policies remain on every table. Also hardened
`/channels`'s page component to catch a single channel's
`getChannelMembers` failure without taking down the whole page — it
shouldn't be possible for `channels`-select and `get_channel_members` to
disagree on membership again, but it clearly wasn't impossible before
either.

Lesson for future RLS migrations on this project: never guess a policy
name in a `drop policy` statement — query `pg_policies` first, every
time, even for "obviously" named policies.
