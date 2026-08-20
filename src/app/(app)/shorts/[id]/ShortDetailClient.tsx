"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Channel, Review, Short, ShortAltTitle } from "@/lib/database.types";
import {
  formatDuration,
  formatSlotFull,
  relativeTime,
  statusLabel,
  statusTagClass,
} from "@/lib/format";
import {
  approveShort,
  addReview,
  updateShortFields,
  draftMetadata,
  useAltTitle,
  publishShortNow,
} from "@/lib/actions";

export default function ShortDetailClient({
  short,
  channel,
  reviews,
  altTitles,
  currentUserEmail,
}: {
  short: Short;
  channel: Channel | null;
  reviews: Review[];
  altTitles: ShortAltTitle[];
  currentUserEmail: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(short.title);
  const [description, setDescription] = useState(short.description);
  const [tags, setTags] = useState<string[]>(short.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [visibility, setVisibility] = useState(short.visibility);
  const [playlist, setPlaylist] = useState(short.playlist ?? "");
  const [madeForKids, setMadeForKids] = useState(short.made_for_kids);
  const [allowComments, setAllowComments] = useState(short.allow_comments);
  const [noteDraft, setNoteDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isApproving, startApprove] = useTransition();
  const [isNoting, startNote] = useTransition();
  const [isDrafting, startDraft] = useTransition();
  const [isPublishing, startPublish] = useTransition();
  const [draftError, setDraftError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  function addTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const t = tagDraft.trim().replace(/^#?/, "#");
    if (t.length > 1 && !tags.includes(t) && tags.length < 15) {
      setTags([...tags, t]);
      setDirty(true);
    }
    setTagDraft("");
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
    setDirty(true);
  }

  function save() {
    startTransition(async () => {
      await updateShortFields(short.id, {
        title,
        description,
        tags,
        visibility,
        playlist: playlist || null,
        made_for_kids: madeForKids,
        allow_comments: allowComments,
      });
      setDirty(false);
      router.refresh();
    });
  }

  function approve() {
    startApprove(async () => {
      await approveShort(short.id);
      router.refresh();
    });
  }

  function submitNote() {
    const body = noteDraft.trim();
    if (!body) return;
    startNote(async () => {
      await addReview(short.id, currentUserEmail, body);
      setNoteDraft("");
      router.refresh();
    });
  }

  function draftWithAi() {
    setDraftError(null);
    startDraft(async () => {
      const result = await draftMetadata(short.id);
      if (!result.ok) {
        setDraftError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function pickAltTitle(text: string) {
    startTransition(async () => {
      await useAltTitle(short.id, text);
      router.refresh();
    });
  }

  function publishNow() {
    setPublishError(null);
    setPublishedId(null);
    startPublish(async () => {
      const result = await publishShortNow(short.id);
      if (!result.ok) {
        setPublishError(result.error);
        return;
      }
      setPublishedId(result.videoId);
      router.refresh();
    });
  }

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <div className="flex items-center gap-2">
        <Link href="/queue" className="btn btn-ghost" style={{ fontSize: "12.5px" }}>
          ← Queue
        </Link>
        <span style={{ fontSize: "12.5px", color: "color-mix(in srgb, var(--color-text) 40%, transparent)" }}>/</span>
        <span style={{ fontSize: "12.5px", color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>
          {short.title}
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "236px 1fr", gap: "var(--space-6)", alignItems: "start" }}>
        <div className="flex flex-col gap-3" style={{ position: "sticky", top: "var(--space-4)" }}>
          <div
            style={{
              position: "relative",
              aspectRatio: "9/16",
              borderRadius: 24,
              background: "var(--color-neutral-200)",
              border: "1px solid var(--color-divider)",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            <div className="flex flex-col items-center gap-2">
              <div style={{ width: 52, height: 52, borderRadius: 999, background: "color-mix(in srgb, var(--color-neutral-900) 12%, transparent)", display: "grid", placeItems: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--color-neutral-700)">
                  <path d="M8 5l11 7-11 7z" />
                </svg>
              </div>
              <span style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>
                {short.file_name ?? "no file yet"}
              </span>
            </div>
            <span
              style={{
                position: "absolute",
                bottom: 10,
                right: 10,
                font: "700 10px/1 var(--font-body)",
                background: "color-mix(in srgb, var(--color-neutral-900) 72%, transparent)",
                color: "var(--color-bg)",
                padding: "4px 7px",
                borderRadius: 999,
              }}
            >
              {formatDuration(short.duration_seconds)}
            </span>
          </div>
          <div className="card elev-sm" style={{ gap: "var(--space-2)" }}>
            <div className="card-kicker">Trend read</div>
            {short.trend_score != null ? (
              <>
                <div className="flex items-center gap-2">
                  <span style={{ font: "400 26px/1 var(--font-heading)" }}>
                    {short.trend_score}
                  </span>
                  <span style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                    / 100 hook/SEO estimate
                  </span>
                </div>
                {short.trend_note && (
                  <div style={{ fontSize: "11.5px", lineHeight: 1.5, color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>
                    {short.trend_note}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: "11.5px", lineHeight: 1.5, color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>
                Not scored yet — click &quot;Draft with AI&quot; to get a
                real, AI-estimated hook/SEO score for the current title and
                description.
              </div>
            )}
          </div>

          {altTitles.length > 0 && (
            <div className="card elev-sm" style={{ gap: "var(--space-2)" }}>
              <div className="card-kicker">AI alt titles</div>
              {altTitles.map((alt) => (
                <button
                  key={alt.id}
                  onClick={() => pickAltTitle(alt.text)}
                  className="flex items-center gap-2"
                  style={{
                    border: 0,
                    background: "var(--color-bg)",
                    borderRadius: 14,
                    padding: "8px 10px",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: "12px",
                    lineHeight: 1.4,
                  }}
                >
                  {alt.text}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1" style={{ minWidth: 240 }}>
              <h1 style={{ fontSize: 30, margin: "0 0 6px" }}>{short.title}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1" style={{ fontSize: "12.5px", color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>
                  <span className="dot" style={{ width: 7, height: 7, background: channel?.dot ?? "var(--color-neutral-500)" }} />
                  {channel?.name ?? "No channel"}
                </span>
                <span className={statusTagClass(short.status)}>{statusLabel(short.status)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={draftWithAi}
                disabled={isDrafting}
                className="btn btn-secondary"
              >
                {isDrafting ? "Drafting…" : "Draft with AI"}
              </button>
              <button onClick={approve} disabled={isApproving || short.status === "approved"} className="btn btn-primary">
                {short.status === "approved" ? "Approved ✓" : isApproving ? "Approving…" : "Approve for upload"}
              </button>
            </div>
          </div>
          {draftError && (
            <div style={{ fontSize: 12, color: "var(--color-accent-700)" }}>{draftError}</div>
          )}

          <div className="flex flex-col gap-3" style={{ padding: "var(--space-4)", borderRadius: 26, background: "var(--color-surface)" }}>
            <div className="field">
              <label>
                Title <span style={{ opacity: 0.55 }}>· {title.length}/100</span>
              </label>
              <input
                className="input"
                value={title}
                maxLength={100}
                onChange={(e) => markDirty(setTitle)(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea
                className="input"
                style={{ minHeight: 120, lineHeight: 1.55 }}
                value={description}
                onChange={(e) => markDirty(setDescription)(e.target.value)}
              />
            </div>
            <div className="field">
              <label>
                Tags <span style={{ opacity: 0.55 }}>· {tags.length} of 15</span>
              </label>
              <div
                className="flex flex-wrap gap-1"
                style={{ padding: "9px 12px", borderRadius: 20, background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}
              >
                {tags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1"
                    style={{
                      font: "600 11.5px/1 var(--font-body)",
                      padding: "5px 9px",
                      borderRadius: 999,
                      background: "var(--color-accent-100)",
                      color: "var(--color-accent-800)",
                    }}
                  >
                    {t}
                    <button
                      onClick={() => removeTag(t)}
                      style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--color-accent-700)", font: "700 12px/1 var(--font-body)", padding: 0 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={addTag}
                  placeholder="add a tag…"
                  disabled={tags.length >= 15}
                  style={{ border: 0, background: "transparent", outline: "none", fontSize: "11.5px", flex: 1, minWidth: 80 }}
                />
              </div>
            </div>
            {dirty && (
              <button onClick={save} disabled={isPending} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
                {isPending ? "Saving…" : "Save changes"}
              </button>
            )}
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div className="flex flex-col gap-3" style={{ padding: "var(--space-4)", borderRadius: 26, background: "var(--color-surface)" }}>
              <div style={{ font: "400 17px/1 var(--font-heading)" }}>Settings</div>
              <div className="field">
                <label>Visibility when it lands</label>
                <div className="seg" style={{ width: "100%" }}>
                  {(["public", "unlisted", "private"] as const).map((v) => (
                    <label key={v} className="seg-opt" style={{ flex: 1, justifyContent: "center" }}>
                      <input
                        type="radio"
                        name="vis"
                        checked={visibility === v}
                        onChange={() => markDirty(setVisibility)(v)}
                      />
                      <span style={{ textTransform: "capitalize" }}>{v}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Playlist</label>
                <input
                  className="input"
                  value={playlist}
                  placeholder="No playlist"
                  onChange={(e) => markDirty(setPlaylist)(e.target.value)}
                />
              </div>
              <label className="radio" style={{ gap: 9 }}>
                <input
                  type="checkbox"
                  checked={madeForKids}
                  onChange={(e) => markDirty(setMadeForKids)(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: "var(--color-accent)" }}
                />
                <span style={{ fontSize: 13 }}>Made for kids</span>
              </label>
              <label className="radio" style={{ gap: 9 }}>
                <input
                  type="checkbox"
                  checked={allowComments}
                  onChange={(e) => markDirty(setAllowComments)(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: "var(--color-accent)" }}
                />
                <span style={{ fontSize: 13 }}>Allow comments</span>
              </label>
            </div>

            <div className="flex flex-col gap-3" style={{ padding: "var(--space-4)", borderRadius: 26, background: "var(--color-surface)" }}>
              <div style={{ font: "400 17px/1 var(--font-heading)" }}>Slot</div>
              <div style={{ fontSize: 14 }}>{formatSlotFull(short.slot_at)}</div>
              <Link href="/calendar" className="btn btn-secondary" style={{ alignSelf: "flex-start", fontSize: "12.5px" }}>
                Change on calendar
              </Link>
              {channel?.youtube_connected ? (
                <div className="flex flex-col gap-2" style={{ marginTop: "auto" }}>
                  <button
                    onClick={publishNow}
                    disabled={isPublishing || short.status === "live"}
                    className="btn btn-primary"
                    style={{ fontSize: "12.5px" }}
                  >
                    {short.status === "live"
                      ? "Live on YouTube ✓"
                      : isPublishing
                      ? "Uploading to YouTube…"
                      : "Publish now"}
                  </button>
                  {publishError && (
                    <span style={{ fontSize: 11.5, color: "var(--color-accent-700)" }}>
                      {publishError}
                    </span>
                  )}
                  {publishedId && (
                    <a
                      href={`https://youtube.com/watch?v=${publishedId}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 11.5, color: "var(--color-accent-700)" }}
                    >
                      View on YouTube →
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2" style={{ marginTop: "auto", padding: "var(--space-2) var(--space-3)", borderRadius: 18, background: "var(--color-bg)" }}>
                  <span style={{ fontSize: "11.5px", lineHeight: 1.4, color: "color-mix(in srgb, var(--color-text) 65%, transparent)" }}>
                    {channel
                      ? `${channel.name} isn't connected to YouTube yet.`
                      : "No channel."}{" "}
                    <Link href="/channels" style={{ color: "var(--color-accent)" }}>
                      Connect it
                    </Link>{" "}
                    to publish for real.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3" style={{ padding: "var(--space-4)", borderRadius: 26, background: "var(--color-accent-100)" }}>
            <div className="flex items-center gap-2">
              <span style={{ font: "400 17px/1 var(--font-heading)", color: "var(--color-accent-900)" }}>Review</span>
              <span className={statusTagClass(short.status)} style={{ marginLeft: "auto" }}>
                {statusLabel(short.status)}
              </span>
            </div>
            {reviews.map((r) => (
              <div key={r.id} className="flex gap-2" style={{ gap: 11 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    flex: "none",
                    borderRadius: 999,
                    background: "var(--color-accent-2-300)",
                    display: "grid",
                    placeItems: "center",
                    font: "700 11px/1 var(--font-body)",
                    color: "var(--color-accent-2-900)",
                  }}
                >
                  {initials(r.author)}
                </div>
                <div className="flex flex-col" style={{ gap: 3 }}>
                  <span style={{ font: "700 12.5px/1 var(--font-body)", color: "var(--color-accent-900)" }}>
                    {r.author} <span style={{ fontWeight: 400, opacity: 0.6 }}>· {relativeTime(r.created_at)}</span>
                  </span>
                  <span style={{ fontSize: "12.5px", lineHeight: 1.5, color: "var(--color-accent-900)", opacity: 0.85 }}>
                    {r.body}
                  </span>
                </div>
              </div>
            ))}
            <div
              className="flex items-center gap-2"
              style={{ paddingTop: "var(--space-2)", borderTop: "1px solid color-mix(in srgb, var(--color-accent-900) 12%, transparent)" }}
            >
              <input
                className="input"
                placeholder="Leave a note…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitNote()}
                style={{ background: "var(--color-bg)", flex: 1 }}
              />
              <button onClick={submitNote} disabled={isNoting} className="btn btn-primary" style={{ fontSize: "12.5px" }}>
                {isNoting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
