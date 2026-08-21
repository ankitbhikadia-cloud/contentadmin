// Shared helpers for editing a short's calendar slot — used by the
// Calendar page's drag/pencil editor and by the Shorts detail page's own
// "Edit time" control, so the local-time handling and the "already public
// on YouTube" lock rule can't drift between the two places that edit a
// slot.
import type { Short } from "@/lib/database.types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in the browser's local
// time zone, which is also the zone every date built from one of these
// values ends up in — so this is a plain reformat, not a zone conversion.
export function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultEditValue(short: Short) {
  if (short.slot_at) return toDatetimeLocalValue(short.slot_at);
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return toDatetimeLocalValue(d.toISOString());
}

// A short that's already actually public on YouTube has no "scheduled
// time" left to move — see setSlot in actions.ts, which enforces this
// same rule server-side. This mirrors it client-side just to grey the
// short out / disable editing and explain why, before a doomed request
// round-trips.
export function isLocked(short: Short) {
  return short.status === "live" && (!short.slot_at || new Date(short.slot_at) <= new Date());
}
