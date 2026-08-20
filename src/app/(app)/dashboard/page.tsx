import Link from "next/link";
import { UploadIcon, ZapIcon } from "@/components/icons";
import { getChannels, getShorts, getDashboardCounts } from "@/lib/data";
import { formatDuration, statusLabel, statusTagClass } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [channels, shorts, counts] = await Promise.all([
    getChannels(),
    getShorts(),
    getDashboardCounts(),
  ]);
  const channelById = new Map(channels.map((c) => [c.id, c]));

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const today = shorts
    .filter(
      (s) => s.slot_at && new Date(s.slot_at) >= startOfDay && new Date(s.slot_at) < endOfDay
    )
    .sort((a, b) => new Date(a.slot_at!).getTime() - new Date(b.slot_at!).getTime());

  const week: { label: string; date: Date; isToday: boolean }[] = [];
  const weekStart = new Date(startOfDay.getTime() - startOfDay.getDay() * 86400000);
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime() + i * 86400000);
    week.push({
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      date: d,
      isToday: d.toDateString() === now.toDateString(),
    });
  }
  const weekDots = week.map((d) => {
    const dayShorts = shorts.filter(
      (s) => s.slot_at && new Date(s.slot_at).toDateString() === d.date.toDateString()
    );
    const channelIds = Array.from(new Set(dayShorts.map((s) => s.channel_id))).slice(0, 3);
    return channelIds.map((id) => channelById.get(id)?.dot ?? "var(--color-neutral-500)");
  });

  const aiDrafted = shorts.filter(
    (s) => s.metadata_source === "ai" || s.metadata_source === "ai_video"
  ).length;

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1" style={{ minWidth: 260 }}>
          <div style={{ font: "600 11px/1 var(--font-body)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
            {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1 style={{ margin: "8px 0 4px" }}>Good {greeting(now)}</h1>
          <p className="text-muted" style={{ margin: 0, fontSize: "14.5px", maxWidth: "52ch" }}>
            {today.length > 0
              ? `${today.length} short${today.length === 1 ? "" : "s"} go out today.`
              : "Nothing slotted for today."}{" "}
            {counts.needsReview > 0 &&
              `${counts.needsReview} waiting on a reviewer before anything ships.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/import" className="btn btn-secondary">
            <UploadIcon size={15} />
            Import videos
          </Link>
          <Link href="/calendar" className="btn btn-primary">
            Open calendar
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card elev-sm" style={{ gap: 4 }}>
          <div className="card-kicker">Scheduled</div>
          <div style={{ font: "400 38px/1 var(--font-heading)" }}>{counts.scheduled}</div>
          <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
            across the next 3 weeks
          </div>
        </div>
        <div className="card elev-sm" style={{ gap: 4, background: "var(--color-accent-100)" }}>
          <div className="card-kicker">Waiting on review</div>
          <div style={{ font: "400 38px/1 var(--font-heading)", color: "var(--color-accent-800)" }}>
            {counts.needsReview}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-accent-800)", opacity: 0.75 }}>
            {today.filter((s) => s.status === "needs_review").length} slotted for today
          </div>
        </div>
        <div className="card elev-sm" style={{ gap: 4 }}>
          <div className="card-kicker">Went live this week</div>
          <div style={{ font: "400 38px/1 var(--font-heading)" }}>{counts.liveThisWeek}</div>
          <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
            of {counts.liveThisWeek + counts.scheduled} planned
          </div>
        </div>
        <div className="card elev-sm" style={{ gap: 4 }}>
          <div className="card-kicker">Failed uploads</div>
          <div style={{ font: "400 38px/1 var(--font-heading)" }}>{counts.failed}</div>
          <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
            {counts.failed > 0 ? "check the auto-uploader log" : "all clear"}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.45fr 1fr", gap: "var(--space-4)", alignItems: "start" }}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3" style={{ alignItems: "baseline" }}>
            <h3 style={{ margin: 0 }}>Going out today</h3>
            <Link href="/queue" className="btn btn-ghost" style={{ fontSize: "12.5px" }}>
              See the whole queue →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {today.length === 0 && (
              <div className="text-muted" style={{ fontSize: 13, padding: "var(--space-2) var(--space-3)" }}>
                Nothing slotted for today yet.
              </div>
            )}
            {today.map((s) => {
              const ch = channelById.get(s.channel_id);
              const time = new Date(s.slot_at!).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <Link
                  key={s.id}
                  href={`/shorts/${s.id}`}
                  className="flex items-center gap-3"
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: 22,
                    background: "var(--color-surface)",
                    color: "inherit",
                  }}
                >
                  <div style={{ font: "400 15px/1 var(--font-heading)", width: 64, flex: "none", color: "var(--color-accent-700)" }}>
                    {time}
                  </div>
                  <div className="thumb" style={{ width: 38, height: 56 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--color-neutral-500)">
                      <path d="M8 5l11 7-11 7z" />
                    </svg>
                    <span className="thumb-dur">{formatDuration(s.duration_seconds)}</span>
                  </div>
                  <div className="flex flex-col min-w-0" style={{ flex: 1, gap: 3 }}>
                    <div className="truncate" style={{ font: "700 13.5px/1.25 var(--font-body)" }}>
                      {s.title}
                    </div>
                    <div className="flex items-center gap-2" style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 52%, transparent)" }}>
                      <span className="dot" style={{ width: 6, height: 6, background: ch?.dot ?? "var(--color-neutral-500)" }} />
                      {ch?.name ?? "Unknown channel"}
                    </div>
                  </div>
                  <span className={statusTagClass(s.status)}>{statusLabel(s.status)}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 style={{ margin: 0 }}>This week</h3>
          <div className="cal-grid" style={{ padding: "var(--space-3)", borderRadius: 26, background: "var(--color-surface)" }}>
            {week.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div style={{ font: "600 9.5px/1 var(--font-body)", letterSpacing: "0.06em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>
                  {d.label}
                </div>
                <div style={{ position: "relative", width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 999 }}>
                  {d.isToday && (
                    <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: "var(--color-accent)" }} />
                  )}
                  <span style={{ position: "relative", font: "700 12px/1 var(--font-body)", color: d.isToday ? "var(--color-bg)" : "var(--color-text)" }}>
                    {d.date.getDate()}
                  </span>
                </div>
                <div className="flex" style={{ gap: 3, minHeight: 8 }}>
                  {weekDots[i].map((c, j) => (
                    <span key={j} className="dot" style={{ width: 6, height: 6, background: c }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="card elev-sm" style={{ background: "var(--color-accent-2-100)", gap: "var(--space-2)" }}>
            <div className="flex items-center gap-2">
              <ZapIcon size={16} color="var(--color-accent-2-800)" />
              <div style={{ font: "700 12.5px/1 var(--font-body)", color: "var(--color-accent-2-800)" }}>
                {aiDrafted} of {shorts.length} have drafted metadata
              </div>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-accent-2-800)", opacity: 0.85 }}>
              AI-drafted titles, tags and descriptions are on the roadmap. For now, metadata is edited by hand from the short's detail page.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
