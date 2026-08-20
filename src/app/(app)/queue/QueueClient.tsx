"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListIcon, BoardIcon } from "@/components/icons";
import type { Channel, Short } from "@/lib/database.types";
import {
  formatDuration,
  formatSlot,
  metadataLabel,
  metadataTagClass,
  statusLabel,
  statusTagClass,
} from "@/lib/format";
import { bulkApprove } from "@/lib/actions";

const BOARD_COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: "draft", label: "Draft", statuses: ["draft"] },
  { key: "needs_review", label: "Needs review", statuses: ["needs_review"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "out", label: "Out", statuses: ["scheduled", "live", "failed"] },
];

export default function QueueClient({
  shorts,
  channels,
  activeChannel,
}: {
  shorts: Short[];
  channels: Channel[];
  activeChannel: string | null;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState<"table" | "board">("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const channelById = useMemo(
    () => new Map(channels.map((c) => [c.id, c])),
    [channels]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function onBulkApprove() {
    const ids = Array.from(selected);
    startTransition(async () => {
      await bulkApprove(ids);
      clearSelection();
      router.refresh();
    });
  }

  const activeChannelName = activeChannel
    ? channelById.get(activeChannel)?.name
    : null;

  return (
    <div className="page">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1" style={{ minWidth: 240 }}>
          <h1 style={{ fontSize: 34, margin: "0 0 4px" }}>Queue</h1>
          <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
            {shorts.length} short{shorts.length === 1 ? "" : "s"} in flight
            {activeChannelName ? ` on ${activeChannelName}` : ""}. Approve one
            and it holds its slot until publishing is connected.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="seg">
            <label className="seg-opt">
              <input
                type="radio"
                name="ql"
                checked={layout === "table"}
                onChange={() => setLayout("table")}
              />
              <ListIcon size={13} />
              List
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="ql"
                checked={layout === "board"}
                onChange={() => setLayout("board")}
              />
              <BoardIcon size={13} />
              Board
            </label>
          </div>
          <Link href="/import" className="btn btn-primary">
            Add videos
          </Link>
        </div>
      </div>

      {selected.size > 0 && (
        <div
          className="flex items-center gap-3"
          style={{
            padding: "var(--space-2) var(--space-3)",
            borderRadius: 999,
            background: "var(--color-accent-200)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <span style={{ font: "700 13px/1 var(--font-body)", color: "var(--color-accent-900)" }}>
            {selected.size} short{selected.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex gap-2 flex-wrap" style={{ marginLeft: "auto" }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: "6px 12px", borderColor: "var(--color-accent-600)", color: "var(--color-accent-900)" }}
              disabled
              title="AI metadata drafting is coming in a later phase"
            >
              Generate metadata
            </button>
            <button
              onClick={onBulkApprove}
              disabled={isPending}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: "6px 12px", borderColor: "var(--color-accent-600)", color: "var(--color-accent-900)" }}
            >
              {isPending ? "Approving…" : "Approve"}
            </button>
            <Link
              href="/calendar"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: "6px 12px", borderColor: "var(--color-accent-600)", color: "var(--color-accent-900)" }}
            >
              Spread across calendar
            </Link>
            <button
              onClick={clearSelection}
              className="btn btn-ghost"
              style={{ fontSize: 12, color: "var(--color-accent-900)" }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {layout === "table" ? (
        <div style={{ borderRadius: 26, background: "var(--color-surface)", padding: "var(--space-2) var(--space-4) var(--space-3)", overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 940 }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>Short</th>
                <th style={{ width: 130 }}>Channel</th>
                <th style={{ width: 118 }}>Metadata</th>
                <th style={{ width: 150 }}>Slot</th>
                <th style={{ width: 130 }}>Status</th>
                <th style={{ width: 86 }}></th>
              </tr>
            </thead>
            <tbody>
              {shorts.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted" style={{ padding: "var(--space-4)", textAlign: "center" }}>
                    No shorts yet — import some to get started.
                  </td>
                </tr>
              )}
              {shorts.map((s) => {
                const ch = channelById.get(s.channel_id);
                return (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        style={{ width: 15, height: 15, accentColor: "var(--color-accent)", cursor: "pointer" }}
                      />
                    </td>
                    <td>
                      <Link href={`/shorts/${s.id}`} className="flex items-center gap-3" style={{ color: "inherit" }}>
                        <div className="thumb" style={{ width: 32, height: 46 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--color-neutral-500)">
                            <path d="M8 5l11 7-11 7z" />
                          </svg>
                        </div>
                        <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
                          <span style={{ font: "700 13px/1.25 var(--font-body)" }}>{s.title}</span>
                          <span style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                            {formatDuration(s.duration_seconds)}
                          </span>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <span className="flex items-center gap-2" style={{ fontSize: "12.5px" }}>
                        <span className="dot" style={{ width: 7, height: 7, background: ch?.dot ?? "var(--color-neutral-500)" }} />
                        {ch?.name ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span className={metadataTagClass(s.metadata_source)}>
                        {metadataLabel(s.metadata_source)}
                      </span>
                    </td>
                    <td style={{ fontSize: "12.5px", color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>
                      {formatSlot(s.slot_at)}
                    </td>
                    <td>
                      <span className={statusTagClass(s.status)}>{statusLabel(s.status)}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/shorts/${s.id}`} className="btn btn-ghost" style={{ fontSize: 12 }}>
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="board-grid">
          {BOARD_COLUMNS.map((col) => {
            const items = shorts.filter((s) => col.statuses.includes(s.status));
            return (
              <div
                key={col.key}
                className="flex flex-col gap-2"
                style={{ padding: "var(--space-3)", borderRadius: 24, background: "var(--color-surface)" }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ font: "400 15px/1 var(--font-heading)" }}>{col.label}</span>
                  <span
                    style={{
                      font: "700 10.5px/1 var(--font-body)",
                      padding: "3px 7px",
                      borderRadius: 999,
                      background: "var(--color-bg)",
                      color: "color-mix(in srgb, var(--color-text) 60%, transparent)",
                    }}
                  >
                    {items.length}
                  </span>
                </div>
                {items.map((s) => {
                  const ch = channelById.get(s.channel_id);
                  return (
                    <Link
                      key={s.id}
                      href={`/shorts/${s.id}`}
                      className="flex flex-col gap-2"
                      style={{
                        padding: "var(--space-3)",
                        borderRadius: 18,
                        background: "var(--color-bg)",
                        boxShadow: "var(--shadow-sm)",
                        color: "inherit",
                      }}
                    >
                      <div style={{ font: "700 12.5px/1.35 var(--font-body)" }}>{s.title}</div>
                      <div className="flex items-center gap-2" style={{ fontSize: "10.5px", color: "color-mix(in srgb, var(--color-text) 52%, transparent)" }}>
                        <span className="dot" style={{ width: 6, height: 6, background: ch?.dot ?? "var(--color-neutral-500)" }} />
                        {ch?.name ?? "—"} · {formatDuration(s.duration_seconds)}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={metadataTagClass(s.metadata_source)}>
                          {metadataLabel(s.metadata_source)}
                        </span>
                        <span style={{ fontSize: "10.5px", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                          {formatSlot(s.slot_at)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {items.length === 0 && (
                  <div style={{ padding: "var(--space-3) var(--space-2)", fontSize: "11.5px", textAlign: "center", color: "color-mix(in srgb, var(--color-text) 42%, transparent)" }}>
                    Nothing here. Nice.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
