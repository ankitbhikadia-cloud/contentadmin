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
