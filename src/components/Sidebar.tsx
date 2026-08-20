"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  DashboardIcon,
  QueueIcon,
  CalendarIcon,
  UploadIcon,
  ZapIcon,
} from "@/components/icons";
import type { Channel } from "@/lib/database.types";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/queue", label: "Queue", icon: QueueIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/import", label: "Import", icon: UploadIcon },
  { href: "/auto-uploader", label: "Auto-uploader", icon: ZapIcon },
];

export default function Sidebar({
  channels,
  needsReviewCount,
}: {
  channels: Channel[];
  needsReviewCount: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeChannel = searchParams.get("ch");

  function channelHref(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (activeChannel === id) {
      params.delete("ch");
    } else {
      params.set("ch", id);
    }
    const qs = params.toString();
    const base = pathname === "/dashboard" || pathname === "/auto-uploader"
      ? "/queue"
      : pathname;
    return qs ? `${base}?${qs}` : base;
  }

  return (
    <aside className="sidebar">
      <div className="flex items-center gap-2" style={{ padding: "0 6px" }}>
        <div
          style={{
            width: 30,
            height: 30,
            flex: "none",
            borderRadius: 999,
            background: "var(--color-accent)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-bg)"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 3v18l15-9z" />
          </svg>
        </div>
        <div style={{ font: "400 17px/1 var(--font-heading)", letterSpacing: "-0.01em" }}>
          ContentAdmin
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="section-label">Channels</div>
        {channels.map((c) => (
          <Link
            key={c.id}
            href={channelHref(c.id)}
            className={`channel-item${activeChannel === c.id ? " active" : ""}`}
          >
            <span className="dot" style={{ position: "relative", background: c.dot ?? "var(--color-accent-500)" }} />
            <span className="flex flex-col min-w-0" style={{ gap: 1, position: "relative" }}>
              <span className="truncate" style={{ font: "700 12.5px/1.1 var(--font-body)" }}>
                {c.name}
              </span>
              <span
                className="truncate"
                style={{ font: "400 10.5px/1.1 var(--font-body)", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}
              >
                {c.sub}
              </span>
            </span>
          </Link>
        ))}
        <Link
          href="/channels"
          className={`channel-item${pathname === "/channels" ? " active" : ""}`}
          style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}
        >
          <span
            className="dot"
            style={{ background: "transparent", border: "1.5px dashed color-mix(in srgb, var(--color-text) 45%, transparent)" }}
          />
          <span style={{ font: "700 12px/1.1 var(--font-body)" }}>
            + Add / manage channels
          </span>
        </Link>
      </div>

      <div className="flex flex-col" style={{ gap: 2 }}>
        <div className="section-label" style={{ paddingBottom: 6 }}>
          Workspace
        </div>
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${active ? " active" : ""}`}
            >
              <span className="nav-item-inner">
                <Icon size={16} strokeWidth={2.75} />
                <span className="nav-item-label">{item.label}</span>
                {item.href === "/queue" && needsReviewCount > 0 && (
                  <span className="pill-count" style={{ marginLeft: "auto" }}>
                    {needsReviewCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>

      <div
        className="flex flex-col gap-2"
        style={{
          marginTop: "auto",
          padding: "var(--space-3)",
          borderRadius: 22,
          background: "var(--color-bg)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "var(--color-neutral-400)",
            }}
          />
          <span style={{ font: "700 11.5px/1 var(--font-body)" }}>
            Auto-uploader
          </span>
        </div>
        <div
          style={{
            font: "400 11px/1.45 var(--font-body)",
            color: "color-mix(in srgb, var(--color-text) 60%, transparent)",
          }}
        >
          Not connected yet — real YouTube publishing lands in a later phase.
        </div>
        <Link href="/auto-uploader" className="btn btn-secondary" style={{ justifyContent: "center", fontSize: 12, padding: "6px 12px" }}>
          Open run log
        </Link>
      </div>
    </aside>
  );
}
