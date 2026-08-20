import { getChannels, getUploadRuns } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AutoUploaderPage() {
  const [channels, runs] = await Promise.all([getChannels(), getUploadRuns()]);

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1" style={{ minWidth: 240 }}>
          <h1 style={{ fontSize: 34, margin: "0 0 4px" }}>Auto-uploader</h1>
          <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
            Publishes each approved short to YouTube at its slot, via the
            real YouTube Data API — no browser bot, no shared passwords.
          </p>
        </div>
        <span className="tag tag-neutral">Not connected yet</span>
      </div>

      <div
        className="flex items-center gap-3 flex-wrap"
        style={{ padding: "var(--space-3) var(--space-4)", borderRadius: 26, background: "var(--color-surface)" }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--color-neutral-400)" }} />
        <span style={{ font: "400 17px/1 var(--font-heading)" }}>Not set up</span>
        <span className="text-muted" style={{ fontSize: "12.5px" }}>
          Connect each channel&apos;s YouTube account to start publishing
          automatically.
        </span>
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
            <span className="tag tag-outline">Not connected</span>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }} disabled title="YouTube OAuth connect is coming in a later phase">
              Connect this channel
            </button>
          </div>
        ))}
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
          Once connected: two automatic retries, ten minutes apart. If it
          still fails you get one plain sentence in this log, and the short
          goes back to the queue with its slot held for an hour.
        </div>
      </div>
    </div>
  );
}
