"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ZapIcon } from "@/components/icons";
import type { Channel, Short } from "@/lib/database.types";
import { formatDuration } from "@/lib/format";
import { setSlot } from "@/lib/actions";
import { useRouter } from "next/navigation";

const SLOT_TIMES = ["06:00", "12:30", "18:00", "21:15"];
const SLOT_LABELS = ["6:00a", "12:30p", "6:00p", "9:15p"];

function isoAt(date: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
  return d.toISOString();
}

export default function CalendarClient({
  shorts,
  channels,
}: {
  shorts: Short[];
  channels: Channel[];
}) {
  const router = useRouter();
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const channelById = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);

  const inbox = shorts.filter((s) => !s.slot_at);
  const today = new Date();

  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    const out: { date: Date; inMonth: boolean; items: Short[] }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const items = shorts.filter(
        (s) => s.slot_at && new Date(s.slot_at).toDateString() === d.toDateString()
      );
      out.push({ date: d, inMonth: d.getMonth() === month, items });
    }
    return out;
  }, [viewDate, shorts]);

  function dropOn(date: Date, id: string | null) {
    const shortId = id ?? dragId;
    if (!shortId) return;
    const existingCount = shorts.filter(
      (s) => s.slot_at && new Date(s.slot_at).toDateString() === date.toDateString()
    ).length;
    const time = SLOT_TIMES[existingCount % SLOT_TIMES.length];
    startTransition(async () => {
      await setSlot(shortId, isoAt(date, time));
      router.refresh();
    });
    setDragId(null);
  }

  function autoSlotInbox() {
    const days = [1, 2, 3, 5];
    startTransition(async () => {
      for (let i = 0; i < inbox.length; i++) {
        const dayOffset = days[i % days.length] + Math.floor(i / days.length) * 7;
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
        const time = SLOT_TIMES[i % SLOT_TIMES.length];
        await setSlot(inbox[i].id, isoAt(date, time));
      }
      router.refresh();
    });
  }

  return (
    <div className="page">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1" style={{ minWidth: 240 }}>
          <h1 style={{ fontSize: 34, margin: "0 0 4px" }}>
            {viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h1>
          <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
            Drag a short from the inbox onto a day to give it a slot.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            className="btn btn-icon btn-secondary"
            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
          >
            <ChevronLeftIcon size={15} />
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: "12.5px" }}
            onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Today
          </button>
          <button
            className="btn btn-icon btn-secondary"
            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
          >
            <ChevronRightIcon size={15} />
          </button>
          <button className="btn btn-primary" onClick={autoSlotInbox} disabled={isPending || inbox.length === 0}>
            <ZapIcon size={15} />
            Auto-slot the inbox
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 268px", gap: "var(--space-4)", alignItems: "start" }}>
        <div style={{ padding: "var(--space-3)", borderRadius: 26, background: "var(--color-surface)" }}>
          <div className="cal-grid" style={{ marginBottom: 6 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                style={{
                  font: "600 10px/1 var(--font-body)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "color-mix(in srgb, var(--color-text) 45%, transparent)",
                  padding: "4px 8px",
                }}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((cell, i) => {
              const isToday = cell.date.toDateString() === today.toDateString();
              const shown = cell.items.slice(0, 3);
              const more = cell.items.length - shown.length;
              return (
                <div
                  key={i}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropOn(cell.date, null);
                  }}
                  onClick={() => {
                    if (inbox.length > 0) dropOn(cell.date, inbox[0].id);
                  }}
                  className="flex flex-col"
                  style={{
                    minHeight: 104,
                    gap: 4,
                    padding: 7,
                    borderRadius: 16,
                    cursor: "pointer",
                    background: cell.inMonth
                      ? "var(--color-bg)"
                      : "color-mix(in srgb, var(--color-neutral-300) 30%, transparent)",
                    border: isToday ? "1.5px solid var(--color-accent)" : "1.5px solid transparent",
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        minWidth: 20,
                        height: 20,
                        padding: "0 5px",
                        borderRadius: 999,
                        background: isToday ? "var(--color-accent)" : "transparent",
                        font: "700 11px/1 var(--font-body)",
                        color: isToday
                          ? "var(--color-bg)"
                          : cell.inMonth
                          ? "var(--color-text)"
                          : "color-mix(in srgb, var(--color-text) 35%, transparent)",
                      }}
                    >
                      {cell.date.getDate()}
                    </span>
                  </div>
                  {shown.map((s) => {
                    const ch = channelById.get(s.channel_id);
                    const time = new Date(s.slot_at!).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    });
                    return (
                      <a
                        key={s.id}
                        href={`/shorts/${s.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 truncate"
                        style={{
                          padding: "3px 6px",
                          borderRadius: 999,
                          background:
                            s.status === "live"
                              ? "var(--color-accent-2-100)"
                              : s.status === "failed"
                              ? "var(--color-accent-200)"
                              : "var(--color-bg)",
                          opacity: s.status === "draft" || s.status === "needs_review" ? 0.65 : 1,
                          color: "inherit",
                        }}
                      >
                        <span className="dot" style={{ width: 5, height: 5, flex: "none", background: ch?.dot ?? "var(--color-neutral-500)" }} />
                        <span className="truncate" style={{ font: "700 9.5px/1.25 var(--font-body)" }}>
                          {time} {s.title}
                        </span>
                      </a>
                    );
                  })}
                  {more > 0 && (
                    <span style={{ fontSize: "9.5px", color: "color-mix(in srgb, var(--color-text) 45%, transparent)", paddingLeft: 6 }}>
                      +{more} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="flex flex-col gap-3"
          style={{ padding: "var(--space-3)", borderRadius: 26, background: "var(--color-accent-100)" }}
        >
          <div className="flex items-baseline gap-2">
            <span style={{ font: "400 17px/1 var(--font-heading)", color: "var(--color-accent-900)" }}>Inbox</span>
            <span style={{ fontSize: 11, color: "var(--color-accent-800)", opacity: 0.7 }}>{inbox.length} waiting</span>
          </div>
          <div style={{ fontSize: "11.5px", lineHeight: 1.45, color: "var(--color-accent-800)", opacity: 0.8 }}>
            Freshly imported, no slot yet. Drag one onto a day, click a day to
            drop the next one in, or auto-slot the batch.
          </div>
          <div className="flex flex-col gap-2">
            {inbox.map((s) => {
              const ch = channelById.get(s.channel_id);
              return (
                <div
                  key={s.id}
                  draggable
                  onDragStart={() => setDragId(s.id)}
                  className="flex items-center gap-2"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 16,
                    background: "var(--color-bg)",
                    cursor: "grab",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <div style={{ width: 26, height: 38, flex: "none", borderRadius: 7, background: "var(--color-neutral-200)", display: "grid", placeItems: "center" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--color-neutral-500)">
                      <path d="M8 5l11 7-11 7z" />
                    </svg>
                  </div>
                  <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
                    <span style={{ font: "700 12px/1.25 var(--font-body)" }}>{s.title}</span>
                    <span className="flex items-center gap-1" style={{ fontSize: "10.5px", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                      <span className="dot" style={{ width: 6, height: 6, background: ch?.dot ?? "var(--color-neutral-500)" }} />
                      {ch?.name} · {formatDuration(s.duration_seconds)}
                    </span>
                  </div>
                </div>
              );
            })}
            {inbox.length === 0 && (
              <div style={{ padding: "var(--space-4) var(--space-2)", textAlign: "center", fontSize: 12, color: "var(--color-accent-800)", opacity: 0.7 }}>
                Inbox clear — everything has a slot.
              </div>
            )}
          </div>
          <div
            className="flex flex-wrap gap-1"
            style={{ paddingTop: "var(--space-2)", borderTop: "1px solid color-mix(in srgb, var(--color-accent-900) 12%, transparent)" }}
          >
            {SLOT_LABELS.map((t) => (
              <span key={t} className="tag tag-accent-2">
                {t}
              </span>
            ))}
            <span style={{ fontSize: "10.5px", color: "var(--color-accent-800)", opacity: 0.7, alignSelf: "center" }}>
              rotation used for drops
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
