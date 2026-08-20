import type { ShortStatus } from "@/lib/database.types";

export const STATUS_LABEL: Record<ShortStatus, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  approved: "Approved",
  scheduled: "Scheduled",
  live: "Live",
  failed: "Failed",
};

export const STATUS_TAG_CLASS: Record<ShortStatus, string> = {
  draft: "tag tag-neutral",
  needs_review: "tag tag-neutral",
  approved: "tag tag-accent",
  scheduled: "tag tag-accent",
  live: "tag tag-accent-2",
  failed: "tag tag-outline",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status as ShortStatus] ?? status;
}

export function statusTagClass(status: string): string {
  return STATUS_TAG_CLASS[status as ShortStatus] ?? "tag tag-neutral";
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSlot(slotAt: string | null): string {
  if (!slotAt) return "Unslotted";
  const d = new Date(slotAt);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const dayLabel = isToday
    ? "Today"
    : d.toLocaleDateString(undefined, { weekday: "short" });
  const timeLabel = d
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .replace(" ", "");
  return `${dayLabel} · ${timeLabel}`;
}

export function formatSlotFull(slotAt: string | null): string {
  if (!slotAt) return "Unslotted";
  const d = new Date(slotAt);
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function metadataLabel(source: string): string {
  if (source === "ai") return "AI drafted";
  if (source === "edited") return "You edited";
  return "Empty";
}

export function metadataTagClass(source: string): string {
  if (source === "ai") return "tag tag-accent-2";
  if (source === "edited") return "tag tag-neutral";
  return "tag tag-outline";
}

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
