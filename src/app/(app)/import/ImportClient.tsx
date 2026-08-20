"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadIcon } from "@/components/icons";
import type { Channel } from "@/lib/database.types";
import { formatBytes } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { createShortsFromImport, type ImportBatchSettings } from "@/lib/actions";

type Row = {
  file: File;
  state: "pending" | "uploading" | "done" | "error";
  error?: string;
};

export default function ImportClient({
  channels,
  defaultChannelId,
}: {
  channels: Channel[];
  defaultChannelId: string | null;
}) {
  const router = useRouter();
  const [channelId, setChannelId] = useState<string | null>(defaultChannelId);
  const [rows, setRows] = useState<Row[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [spreadDays, setSpreadDays] = useState(7);
  const [aiDraft, setAiDraft] = useState(true);
  const [sendForReview, setSendForReview] = useState(false);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next = Array.from(fileList)
      .filter((f) => /\.(mp4|mov)$/i.test(f.name))
      .map((f) => ({ file: f, state: "pending" as const }));
    setRows((prev) => [...prev, ...next]);
  }

  async function uploadAll() {
    if (!channelId || rows.length === 0) return;
    setIsUploading(true);
    const supabase = createClient();
    const uploaded: { name: string; size: number; path: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.state === "done") {
        continue;
      }
      setRows((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, state: "uploading" } : r))
      );
      const path = `${channelId}/${crypto.randomUUID()}-${row.file.name}`;
      const { error } = await supabase.storage
        .from("shorts")
        .upload(path, row.file, { upsert: false });

      if (error) {
        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, state: "error", error: error.message } : r
          )
        );
        continue;
      }
      uploaded.push({ name: row.file.name, size: row.file.size, path });
      setRows((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, state: "done" } : r))
      );
    }

    if (uploaded.length > 0) {
      const settings: ImportBatchSettings = { spreadDays, aiDraft, sendForReview };
      await createShortsFromImport(channelId, uploaded, settings);
    }
    setIsUploading(false);
    router.push("/queue");
  }

  return (
    <div className="page" style={{ maxWidth: 1120 }}>
      <div>
        <h1 style={{ fontSize: 34, margin: "0 0 4px" }}>Import</h1>
        <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
          Drop one short or forty. They land in the queue as drafts — you add
          metadata and a slot, then approve.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 300px", gap: "var(--space-4)", alignItems: "start" }}>
        <div className="flex flex-col gap-3">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            className="flex flex-col items-center gap-2"
            style={{
              padding: "var(--space-8) var(--space-4)",
              borderRadius: 28,
              background: "var(--color-surface)",
              border: "2px dashed color-mix(in srgb, var(--color-text) 22%, transparent)",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
            <div style={{ width: 46, height: 46, borderRadius: 999, background: "var(--color-accent-200)", display: "grid", placeItems: "center" }}>
              <UploadIcon size={20} color="var(--color-accent-800)" />
            </div>
            <div style={{ font: "400 19px/1.2 var(--font-heading)" }}>Drop a folder of shorts here</div>
            <div className="text-muted" style={{ fontSize: "12.5px", maxWidth: "44ch" }}>
              MP4 or MOV. Filenames become working titles — edit them from
              each short&apos;s detail page.
            </div>
          </div>

          <div className="field">
            <label>Channel these imports belong to</label>
            <select
              className="input"
              value={channelId ?? ""}
              onChange={(e) => setChannelId(e.target.value)}
              style={{ appearance: "auto" }}
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div
            className="flex flex-col gap-3"
            style={{ padding: "var(--space-3) var(--space-4)", borderRadius: 22, background: "var(--color-surface)" }}
          >
            <div style={{ font: "400 15px/1.2 var(--font-heading)" }}>Batch settings</div>

            <div className="field" style={{ maxWidth: 260 }}>
              <label>Spread slots across how many days</label>
              <input
                type="number"
                min={0}
                max={90}
                className="input"
                value={spreadDays}
                onChange={(e) => setSpreadDays(Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                {spreadDays > 0
                  ? `Each clip gets a slot at 16:00 UTC, cycling across the next ${spreadDays} day${spreadDays === 1 ? "" : "s"}.`
                  : "0 = leave every clip unscheduled in the Inbox."}
              </span>
            </div>

            <label className="flex items-center gap-2" style={{ fontSize: 12.5, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={aiDraft}
                onChange={(e) => setAiDraft(e.target.checked)}
              />
              Draft titles, descriptions & tags with AI on import
            </label>
            {aiDraft && (
              <span className="text-muted" style={{ fontSize: 11, marginTop: -6, marginLeft: 22 }}>
                Fast text-only drafts from filename/channel context across the whole batch — not
                the video itself. Open an individual short afterward and use its own &quot;Draft
                with AI&quot; for a video-aware draft.
              </span>
            )}

            <label className="flex items-center gap-2" style={{ fontSize: 12.5, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={sendForReview}
                onChange={(e) => setSendForReview(e.target.checked)}
              />
              Send straight to &quot;Needs review&quot; instead of Draft
            </label>
          </div>

          {rows.length > 0 && (
            <div className="flex flex-col gap-2" style={{ padding: "var(--space-3) var(--space-4) var(--space-4)", borderRadius: 26, background: "var(--color-surface)" }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span style={{ font: "400 17px/1 var(--font-heading)" }}>{rows.length} clips in this batch</span>
                <button
                  onClick={uploadAll}
                  disabled={isUploading || !channelId}
                  className="btn btn-primary"
                  style={{ fontSize: "12.5px", marginLeft: "auto" }}
                >
                  {isUploading ? "Uploading…" : "Upload & send to queue"}
                </button>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3" style={{ padding: "var(--space-2) var(--space-3)", borderRadius: 20, background: "var(--color-bg)" }}>
                  <div style={{ width: 28, height: 40, flex: "none", borderRadius: 7, background: "var(--color-neutral-200)", display: "grid", placeItems: "center" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--color-neutral-500)">
                      <path d="M8 5l11 7-11 7z" />
                    </svg>
                  </div>
                  <div className="flex flex-col min-w-0" style={{ flex: 1, gap: 3 }}>
                    <span className="truncate" style={{ font: "700 12.5px/1.25 var(--font-body)" }}>
                      {r.file.name}
                    </span>
                    <span style={{ fontSize: "10.5px", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                      {formatBytes(r.file.size)}
                    </span>
                  </div>
                  <span
                    className={
                      r.state === "done"
                        ? "tag tag-accent-2"
                        : r.state === "error"
                        ? "tag tag-outline"
                        : r.state === "uploading"
                        ? "tag tag-accent"
                        : "tag tag-neutral"
                    }
                    style={{ width: 132, justifyContent: "center" }}
                  >
                    {r.state === "done"
                      ? "Uploaded"
                      : r.state === "error"
                      ? r.error ?? "Failed"
                      : r.state === "uploading"
                      ? "Uploading…"
                      : "Ready"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="card elev-sm" style={{ background: "var(--color-accent-2-100)", gap: 6 }}>
            <div style={{ font: "700 12px/1 var(--font-body)", color: "var(--color-accent-2-800)" }}>
              Nothing uploads to YouTube from here
            </div>
            <div style={{ fontSize: "11.5px", lineHeight: 1.5, color: "var(--color-accent-2-800)", opacity: 0.85 }}>
              Imports land in the queue as {sendForReview ? "“needs review”" : "drafts"}
              {spreadDays > 0 ? `, spread across the next ${spreadDays} day${spreadDays === 1 ? "" : "s"}` : ""}.
              A short only reaches YouTube once its channel is connected,
              it has a slot, and it&apos;s approved — the auto-uploader (or
              &quot;Publish now&quot;) does the actual upload.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
