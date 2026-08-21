"use client";

import { useEffect, useState, useTransition } from "react";
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
  syncMetadataToYoutube,
  setSlot,
} from "@/lib/actions";
import { defaultEditValue, isLocked } from "@/lib/slot";
import { YOUTUBE_TAGS_MAX_CHARS, tagsCharCount } from "@/lib/youtube";

export default function ShortDetailClient({
  short,
  channel,
  reviews,
  altTitles,
  currentUserEmail,
  videoAiConfigured,
  videoUrl,
}: {
  short: Short;
  channel: Channel | null;
  reviews: Review[];
  altTitles: ShortAltTitle[];
  currentUserEmail: string;
  videoAiConfigured: boolean;
  videoUrl: string | null;
}) {
  const router = useRouter();
  const willWatchVideo = videoAiConfigured && !!short.file_path;
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

  // title/description/tags are edited locally and only written back on
  // "Save changes" — but "Draft with AI" and picking an alt title both
  // write straight to the DB via a server action, then router.refresh()
  // gives this component a fresh `short` prop. useState's initial value
  // is only used on first mount, so without this, those flows updated
  // the database and the read-only heading (which renders short.title
  // directly) while the editable fields silently kept showing whatever
  // was there before — exactly the "only title updated" bug. Re-sync
  // whenever the server's actual content changes; string/joined deps
  // (not the raw short.tags array reference, which is a new array on
  // every refresh regardless of content) keep this from also firing,
  // and discarding an in-progress unsaved edit, on refreshes that don't
  // touch these fields (approving, adding a review, publishing).
  const tagsKey = (short.tags ?? []).join(" ");
  useEffect(() => {
    setTitle(short.title);
    setDescription(short.description);
    setTags(short.tags ?? []);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tagsKey is
    // the intentional value-stable proxy for short.tags, see comment above.
  }, [short.title, short.description, tagsKey]);

  const [isPending, startTransition] = useTransition();
  const [isApproving, startApprove] = useTransition();
  const [isNoting, startNote] = useTransition();
  const [isDrafting, startDraft] = useTransition();
  const [isPublishing, startPublish] = useTransition();
  const [isSyncing, startSync] = useTransition();
  const [draftError, setDraftError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncedJustNow, setSyncedJustNow] = useState(false);

  // Precise-time editing, right here on the short's own page — same
  // two-step "pick a time, then confirm" flow as the calendar's pencil
  // editor (see CalendarClient.tsx), sharing its slot-locked check and
  // its datetime-local formatting via src/lib/slot.ts so the two editors
  // can't quietly drift apart. Kept as an inline expand/confirm rather
  // than a modal since this page has room for it.
  const [isSlotEditing, setSlotEditing] = useState(false);
  const [slotValue, setSlotValue] = useState("");
  const [slotConfirmIso, setSlotConfirmIso] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [isSlotSaving, startSlotSave] = useTransition();
  const slotLocked = isLocked(short);

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
    // YouTube's real limit here isn't a tag count, it's a combined
    // character total across every tag (see YOUTUBE_TAGS_MAX_CHARS) — so
    // this checks the actual projected total instead of an arbitrary count.
    const projectedChars = [...tags, t].join(",").length;
    if (t.length > 1 && !tags.includes(t) && projectedChars <= YOUTUBE_TAGS_MAX_CHARS) {
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

  function syncToYoutube() {
    setSyncError(null);
    setSyncedJustNow(false);
    startSync(async () => {
      const result = await syncMetadataToYoutube(short.id);
      if (!result.ok) {
        setSyncError(result.error);
        return;
      }
      setSyncedJustNow(true);
      router.refresh();
    });
  }

  function openSlotEditor() {
    if (slotLocked) return;
    setSlotError(null);
    setSlotConfirmIso(null);
    setSlotValue(defaultEditValue(short));
    setSlotEditing(true);
  }

  function cancelSlotEdit() {
    setSlotEditing(false);
    setSlotConfirmIso(null);
    setSlotError(null);
  }

  function stageSlotChange() {
    if (!slotValue) return;
    setSlotConfirmIso(new Date(slotValue).toISOString());
  }

  function confirmSlotChange() {
    if (!slotConfirmIso) return;
    startSlotSave(async () => {
      const result = await setSlot(short.id, slotConfirmIso);
      if (!result.ok) {
        setSlotError(result.error);
        return;
      }
      setSlotEditing(false);
      setSlotConfirmIso(null);
      setSlotError(null);
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
              background: videoUrl ? "#000" : "var(--color-neutral-200)",
              border: "1px solid var(--color-divider)",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {videoUrl ? (
              // A signed URL from Supabase Storage (generated server-side
              // in page.tsx, since the "shorts" bucket is private) — plays
              // the actual uploaded file right here so it can be checked
              // before it goes out, rather than only ever seeing it live
              // on YouTube after the fact.
              <video
                key={videoUrl}
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <>
                <div className="flex flex-col items-center gap-2">
                  <div style={{ width: 52, height: 52, borderRadius: 999, background: "color-mix(in srgb, var(--color-neutral-900) 12%, transparent)", display: "grid", placeItems: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--color-neutral-700)">
                      <path d="M8 5l11 7-11 7z" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--color-neutral-700)", padding: "0 12px", textAlign: "center" }}>
                    {short.file_path ? "Preview unavailable — try refreshing" : "no file yet"}
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
              </>
            )}
          </div>
          {short.file_name && (
            <div style={{ fontSize: 11, lineHeight: 1.4, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", padding: "0 2px", wordBreak: "break-word" }}>
              {short.file_name}
            </div>
          )}
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
                real, AI-estimated hook/SEO score{" "}
                {willWatchVideo ? "from the actual video" : "from the current title and description"}.
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
                title={
                  willWatchVideo
                    ? "Uploads the video to Gemini and drafts from what's actually shown and said — can take up to a minute or two."
                    : videoAiConfigured
                    ? "No video file on this short yet — drafting from title/description/channel context only."
                    : "GEMINI_API_KEY isn't configured — drafting from title/description/channel context only, not the video."
                }
              >
                {isDrafting
                  ? willWatchVideo
                    ? "Watching video…"
                    : "Drafting…"
                  : "Draft with AI"}
              </button>
              <button onClick={approve} disabled={isApproving || short.status === "approved"} className="btn btn-primary">
                {short.status === "approved" ? "Approved ✓" : isApproving ? "Approving…" : "Approve for upload"}
              </button>
            </div>
          </div>
          {draftError && (
            <div style={{ fontSize: 12, color: "var(--color-accent-700)" }}>{draftError}</div>
          )}
          {!willWatchVideo && (
            <div style={{ fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
              {videoAiConfigured
                ? "This short has no uploaded video file, so \"Draft with AI\" will draft from text signals only."
                : "\"Draft with AI\" currently drafts from title/description/channel context only — it isn't watching the video. Add GEMINI_API_KEY to enable real video analysis."}
            </div>
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
                Tags{" "}
                <span style={{ opacity: 0.55 }}>
                  · {tagsCharCount(tags)}/{YOUTUBE_TAGS_MAX_CHARS} chars (YouTube's real limit)
                </span>
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
                  disabled={tagsCharCount(tags) >= YOUTUBE_TAGS_MAX_CHARS}
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

              {slotLocked && (
                <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                  Already public on YouTube — its publish time can&apos;t be changed anymore.
                </div>
              )}

              {!isSlotEditing ? (
                <div className="flex gap-2">
                  <button
                    onClick={openSlotEditor}
                    disabled={slotLocked}
                    className="btn btn-secondary"
                    style={{ fontSize: "12.5px" }}
                  >
                    Edit time
                  </button>
                  <Link href="/calendar" className="btn btn-ghost" style={{ fontSize: "12.5px" }}>
                    Open calendar
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="datetime-local"
                    className="input"
                    value={slotValue}
                    onChange={(e) => {
                      setSlotValue(e.target.value);
                      setSlotConfirmIso(null);
                    }}
                  />
                  {!slotConfirmIso ? (
                    <div className="flex gap-2">
                      <button onClick={cancelSlotEdit} className="btn btn-ghost" style={{ fontSize: "12.5px" }}>
                        Cancel
                      </button>
                      <button
                        onClick={stageSlotChange}
                        disabled={!slotValue}
                        className="btn btn-primary"
                        style={{ fontSize: "12.5px" }}
                      >
                        Continue
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2" style={{ padding: "var(--space-2) var(--space-3)", borderRadius: 16, background: "var(--color-bg)" }}>
                      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                        {short.slot_at ? (
                          <>Move to <strong>{formatSlotFull(slotConfirmIso)}</strong>?</>
                        ) : (
                          <>Schedule for <strong>{formatSlotFull(slotConfirmIso)}</strong>?</>
                        )}
                      </div>
                      {short.status === "live" && (
                        <div style={{ fontSize: 11, lineHeight: 1.45, color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>
                          This short is already uploaded and privately scheduled on YouTube — its publish time there will be updated to match.
                        </div>
                      )}
                      <div className="flex gap-2" style={{ justifyContent: "flex-end" }}>
                        <button
                          onClick={() => setSlotConfirmIso(null)}
                          disabled={isSlotSaving}
                          className="btn btn-ghost"
                          style={{ fontSize: "12.5px" }}
                        >
                          Back
                        </button>
                        <button
                          onClick={confirmSlotChange}
                          disabled={isSlotSaving}
                          className="btn btn-primary"
                          style={{ fontSize: "12.5px" }}
                        >
                          {isSlotSaving ? "Saving…" : "Confirm"}
                        </button>
                      </div>
                    </div>
                  )}
                  {slotError && (
                    <div style={{ fontSize: 11.5, color: "var(--color-accent-700)" }}>{slotError}</div>
                  )}
                </div>
              )}

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
                  {short.youtube_video_id && (
                    <>
                      <button
                        onClick={syncToYoutube}
                        disabled={isSyncing}
                        className="btn btn-secondary"
                        style={{ fontSize: "12.5px" }}
                        title="Pushes this short's current title, description, and tags to the YouTube video — use this after editing metadata for an already-published short."
                      >
                        {isSyncing ? "Syncing…" : "Sync title/description/tags to YouTube"}
                      </button>
                      {syncError && (
                        <span style={{ fontSize: 11.5, color: "var(--color-accent-700)" }}>
                          {syncError}
                        </span>
                      )}
                      {syncedJustNow && !syncError && (
                        <span style={{ fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                          Synced.
                        </span>
                      )}
                    </>
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
