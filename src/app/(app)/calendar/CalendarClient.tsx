"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, ZapIcon } from "@/components/icons";
import type { Channel, Short } from "@/lib/database.types";
import { formatDuration, formatSlotFull } from "@/lib/format";
import { setSlot } from "@/lib/actions";
import { defaultEditValue, isLocked } from "@/lib/slot";
import { useRouter } from "next/navigation";

const SLOT_TIMES = ["06:00", "12:30", "18:00", "21:15"];
const SLOT_LABELS = ["6:00a", "12:30p", "6:00p", "9:15p"];

function isoAt(date: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
  return d.toISOString();
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

type PendingMove = { short: Short; newSlotIso: string };

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
  const [editing, setEditing] = useState<{ short: Short; value: string } | null>(null);
  const [confirming, setConfirming] = useState<PendingMove | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isMoving, startMove] = useTransition();
  const channelById = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);
  const shortById = useMemo(() => new Map(shorts.map((s) => [s.id, s])), [shorts]);

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

  function stageDrop(date: Date, id: string | null) {
    const shortId = id ?? dragId;
    setDragId(null);
    if (!shortId) return;
    const short = shortById.get(shortId);
    if (!short || isLocked(short)) return;

    let hhmm: string;
    if (short.slot_at) {
      const d = new Date(short.slot_at);
      hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else {
      const existingCount = shorts.filter(
        (s) => s.slot_at && new Date(s.slot_at).toDateString() === date.toDateString()
      ).length;
      hhmm = SLOT_TIMES[existingCount % SLOT_TIMES.length];
    }
    const newSlotIso = isoAt(date, hhmm);
    if (short.slot_at && new Date(short.slot_at).toDateString() === date.toDateString()) {
      return; // dropped back on the day it's already on — nothing to confirm
    }
    setActionError(null);
    setConfirming({ short, newSlotIso });
  }

  function openEditor(short: Short) {
    if (isLocked(short)) return;
    setActionError(null);
    setEditing({ short, value: defaultEditValue(short) });
  }

  function continueFromEditor() {
    if (!editing) return;
    const newSlotIso = new Date(editing.value).toISOString();
    setEditing(null);
    setConfirming({ short: editing.short, newSlotIso });
  }

  function confirmMove() {
    if (!confirming) return;
    startMove(async () => {
      const result = await setSlot(confirming.short.id, confirming.newSlotIso);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setConfirming(null);
      setActionError(null);
      router.refresh();
    });
  }

  function autoSlotInbox() {
    const days = [1, 2, 3, 5];
    startTransition(async () => {
      const errors: string[] = [];
      for (let i = 0; i < inbox.length; i++) {
        const dayOffset = days[i % days.length] + Math.floor(i / days.length) * 7;
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
        const time = SLOT_TIMES[i % SLOT_TIMES.length];
        const result = await setSlot(inbox[i].id, isoAt(date, time));
        if (!result.ok) errors.push(`${inbox[i].title}: ${result.error}`);
      }
      if (errors.length) setActionError(errors.join(" · "));
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
            Drag a short onto a day to give it — or move it to — a slot, or
            use the pencil for an exact time. Every move needs confirming
            before it sticks.
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

      {actionError && !confirming && (
        <div style={{ fontSize: 12.5, color: "var(--color-accent-700)" }}>{actionError}</div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) 268px", gap: "var(--space-4)", alignItems: "start" }}>
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
                    stageDrop(cell.date, null);
                  }}
                  onClick={() => {
                    if (inbox.length > 0) stageDrop(cell.date, inbox[0].id);
                  }}
                  className="flex flex-col"
                  style={{
                    minHeight: 104,
                    minWidth: 0,
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
                    const locked = isLocked(s);
                    const time = new Date(s.slot_at!).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    });
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-1"
                        style={{
                          padding: "3px 4px 3px 6px",
                          borderRadius: 999,
                          minWidth: 0,
                          background:
                            s.status === "live"
                              ? "var(--color-accent-2-100)"
                              : s.status === "failed"
                              ? "var(--color-accent-200)"
                              : "var(--color-bg)",
                          opacity: locked ? 0.55 : s.status === "draft" || s.status === "needs_review" ? 0.65 : 1,
                        }}
                        title={locked ? "Already public on YouTube — publish time can't be changed." : undefined}
                      >
                        <a
                          href={`/shorts/${s.id}`}
                          draggable={!locked}
                          onDragStart={(e) => {
                            if (locked) {
                              e.preventDefault();
                              return;
                            }
                            setDragId(s.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 truncate"
                          style={{ color: "inherit", minWidth: 0, cursor: locked ? "default" : "grab" }}
                        >
                          <span className="dot" style={{ width: 5, height: 5, flex: "none", background: ch?.dot ?? "var(--color-neutral-500)" }} />
                          <span className="truncate" style={{ font: "700 9.5px/1.25 var(--font-body)" }}>
                            {time} {s.title}
                          </span>
                        </a>
                        {!locked && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditor(s);
                            }}
                            className="btn btn-icon"
                            title="Set an exact date & time"
                            style={{
                              flex: "none",
                              width: 15,
                              height: 15,
                              minHeight: 0,
                              padding: 0,
                              border: 0,
                              background: "transparent",
                              color: "color-mix(in srgb, var(--color-text) 45%, transparent)",
                            }}
                          >
                            <PencilIcon size={9} />
                          </button>
                        )}
                      </div>
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
            Freshly imported or approved, no slot yet. Drag one onto a day,
            click a day to drop the next one in, use the pencil for an
            exact time, or auto-slot the batch.
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
                  <div className="flex flex-col min-w-0 flex-1" style={{ gap: 2 }}>
                    <span style={{ font: "700 12px/1.25 var(--font-body)" }}>{s.title}</span>
                    <span className="flex items-center gap-1" style={{ fontSize: "10.5px", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                      <span className="dot" style={{ width: 6, height: 6, background: ch?.dot ?? "var(--color-neutral-500)" }} />
                      {ch?.name} · {formatDuration(s.duration_seconds)}
                    </span>
                  </div>
                  <button
                    onClick={() => openEditor(s)}
                    className="btn btn-icon btn-ghost"
                    title="Set an exact date & time"
                    style={{ flex: "none", width: 22, height: 22, minHeight: 0, padding: 0 }}
                  >
                    <PencilIcon size={11} />
                  </button>
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

      {editing && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "color-mix(in srgb, var(--color-neutral-900) 45%, transparent)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            className="card elev-sm flex flex-col gap-3"
            style={{ width: 320, background: "var(--color-surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-kicker">Set exact time</div>
            <div style={{ font: "700 13.5px/1.35 var(--font-body)" }}>{editing.short.title}</div>
            <input
              type="datetime-local"
              className="input"
              value={editing.value}
              onChange={(e) => setEditing({ short: editing.short, value: e.target.value })}
            />
            <div className="flex gap-2" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={continueFromEditor} disabled={!editing.value}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "color-mix(in srgb, var(--color-neutral-900) 45%, transparent)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
          onClick={() => {
            if (isMoving) return;
            setConfirming(null);
            setActionError(null);
          }}
        >
          <div
            className="card elev-sm flex flex-col gap-3"
            style={{ width: 360, background: "var(--color-surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-kicker">Confirm move</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              {confirming.short.slot_at ? (
                <>
                  Move <strong>{confirming.short.title}</strong> from{" "}
                  {formatSlotFull(confirming.short.slot_at)} to{" "}
                  <strong>{formatSlotFull(confirming.newSlotIso)}</strong>?
                </>
              ) : (
                <>
                  Schedule <strong>{confirming.short.title}</strong> for{" "}
                  <strong>{formatSlotFull(confirming.newSlotIso)}</strong>?
                </>
              )}
            </div>
            {confirming.short.status === "live" && (
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>
                This short is already uploaded and privately scheduled on
                YouTube — its publish time there will be updated to match.
              </div>
            )}
            {actionError && (
              <div style={{ fontSize: 12, color: "var(--color-accent-700)" }}>{actionError}</div>
            )}
            <div className="flex gap-2" style={{ justifyContent: "flex-end" }}>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setConfirming(null);
                  setActionError(null);
                }}
                disabled={isMoving}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmMove} disabled={isMoving}>
                {isMoving ? "Moving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
