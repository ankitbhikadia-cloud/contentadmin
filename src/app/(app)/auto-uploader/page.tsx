import { getChannels, getUploadRuns } from "@/lib/data";
import PublishDueButton from "./PublishDueButton";

export const dynamic = "force-dynamic";
// A manual "publish due shorts now" run can take a while for real
// uploads — see src/lib/publish.ts.
export const maxDuration = 300;

export default async function AutoUploaderPage() {
  const [channels, runs] = await Promise.all([getChannels(), getUploadRuns()]);
  const connectedCount = channels.filter((c) => c.youtube_connected).length;

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1" style={{ minWidth: 240 }}>
          <h1 style={{ fontSize: 34, margin: "0 0 4px" }}>Auto-uploader</h1>
          <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
            Publishes each approved, scheduled short to YouTube at its slot,
            via the real YouTube Data API — no browser bot, no shared
            passwords.
          </p>
        </div>
        <span className={connectedCount > 0 ? "tag tag-accent-2" : "tag tag-neutral"}>
          {connectedCount > 0
            ? `${connectedCount} channel${connectedCount === 1 ? "" : "s"} connected`
            : "Nothing connected yet"}
        </span>
      </div>

      <div
        className="flex items-center gap-3 flex-wrap"
        style={{ padding: "var(--space-3) var(--space-4)", borderRadius: 26, background: "var(--color-surface)" }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: connectedCount > 0 ? "var(--color-accent-2-600)" : "var(--color-neutral-400)",
          }}
        />
        <span style={{ font: "400 17px/1 var(--font-heading)" }}>
          {connectedCount > 0 ? "Live" : "Not set up"}
        </span>
        <span className="text-muted" style={{ fontSize: "12.5px" }}>
          A background job checks once a day (16:05 UTC — Vercel's Hobby
          plan caps cron jobs to daily) for approved shorts past their
          slot time on connected channels and publishes them
          automatically. Don&apos;t want to wait for that? Trigger a
          check right now:
        </span>
        <PublishDueButton />
      </div>

      <div className="flex flex-col gap-2">
        {channels.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3"
            style={{ padding: "var(--space-3) var(--space-4)", borderRadius: 22, background: "var(--color-surface)" }}
          >
            <span className="dot" style={{ width: 8, height: 8, background: c.dot ?? "var(--color-accent-500)" }} />
            <div className="flex flex-col" style={{ flex: 1, gap: 2 }}>
              <span style={{ font: "700 13px/1.25 var(--font-body)" }}>{c.name}</span>
              <span className="text-muted" style={{ fontSize: 11 }}>{c.sub}</span>
            </div>
            {c.youtube_connected ? (
              <span className="tag tag-accent-2">Connected</span>
            ) : (
              <>
                <span className="tag tag-outline">Not connected</span>
                <a
                  href={`/auth/youtube/connect?channel=${c.id}`}
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: "6px 12px" }}
                >
                  Connect this channel
                </a>
              </>
            )}
          </div>
        ))}
        {channels.length === 0 && (
          <div className="text-muted" style={{ fontSize: 13, padding: "var(--space-3)" }}>
            No channels yet — add one from{" "}
            <a href="/channels" style={{ color: "var(--color-accent)" }}>
              Channels
            </a>
            .
          </div>
        )}
      </div>

      {runs.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 style={{ margin: 0 }}>Recent runs</h3>
          {runs.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3"
              style={{ padding: "var(--space-3) var(--space-4)", borderRadius: 22, background: "var(--color-surface)" }}
            >
              <span className="tag tag-neutral">{r.state}</span>
              <span className="text-muted" style={{ fontSize: 12 }}>
                {new Date(r.attempted_at).toLocaleString()}
              </span>
              {r.error_message && (
                <span style={{ fontSize: 12, color: "var(--color-accent-700)" }}>{r.error_message}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2" style={{ padding: "var(--space-4)", borderRadius: 26, background: "var(--color-accent-100)" }}>
        <div style={{ font: "400 17px/1 var(--font-heading)", color: "var(--color-accent-900)" }}>
          When something breaks
        </div>
        <div style={{ fontSize: "12.5px", lineHeight: 1.55, color: "var(--color-accent-900)", opacity: 0.85, maxWidth: "66ch" }}>
          Two automatic retries — spaced out by whatever actually triggers
          a check (the daily cron, or you clicking "Check now" /
          "Publish now" sooner). If it still fails on the third attempt
          within about 4 days, you get the real error from YouTube in this
          log, the short flips to "failed" in the Queue, and its slot moves
          an hour out so it stops sitting on that calendar slot —
          publishing it again from there is a manual "Publish now" on its
          detail page, not automatic.
        </div>
      </div>
    </div>
  );
}
