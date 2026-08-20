# ContentAdmin

Organize YouTube Shorts uploads and scheduling across multiple channels —
built from the "Organic" ContentAdmin design.

See `ContentAdmin-Plan.md` (in the project) for the full phased plan. This
repo currently implements **Phase 1**: the real app — auth, channels,
import, queue, calendar, video detail, and reviewer notes — backed by a
real Supabase database. AI-drafted metadata (Phase 2) and real YouTube
publishing via the YouTube Data API (Phase 3) are not built yet; the UI
has honest placeholders wherever those land later.

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

## Deployment

Connected to Vercel project `contentadmin` (team: Ankit's projects).
Environment variables needed on Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` — the deployed URL, used for the magic-link
  redirect
