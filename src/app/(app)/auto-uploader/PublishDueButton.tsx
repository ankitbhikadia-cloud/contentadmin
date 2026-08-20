"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkAndPublishDue } from "@/lib/actions";

export default function PublishDueButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);

  function run() {
    setSummary(null);
    startTransition(async () => {
      const result = await checkAndPublishDue();
      setSummary(
        result.checked === 0
          ? "Nothing due right now."
          : `Checked ${result.checked} — ${result.succeeded} published, ${result.failed} failed.`
      );
      router.refresh();
    });
  }

  return (
    <span className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
      {summary && (
        <span style={{ fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>
          {summary}
        </span>
      )}
      <button onClick={run} disabled={isPending} className="btn btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }}>
        {isPending ? "Checking…" : "Check now"}
      </button>
    </span>
  );
}
