"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Channel } from "@/lib/database.types";
import {
  createChannel,
  updateChannel,
  deleteChannel,
  disconnectChannel,
} from "@/lib/actions";

type Draft = {
  name: string;
  sub: string;
  cadence: string;
  youtube_channel_id: string;
};

function toDraft(c: Channel): Draft {
  return {
    name: c.name,
    sub: c.sub ?? "",
    cadence: c.cadence ?? "",
    youtube_channel_id: c.youtube_channel_id ?? "",
  };
}

function ChannelCard({
  channel,
  shortsCount,
}: {
  channel: Channel;
  shortsCount: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(toDraft(channel));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [isDisconnecting, startDisconnect] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof Draft>(key: K) {
    return (v: string) => {
      setDraft((d) => ({ ...d, [key]: v }));
      setDirty(true);
      setError(null);
    };
  }

  function save() {
    startSave(async () => {
      const result = await updateChannel(channel.id, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDirty(false);
      router.refresh();
    });
  }

  function remove() {
    startDelete(async () => {
      const result = await deleteChannel(channel.id);
      if (!result.ok) {
        setError(result.error);
        setConfirmDelete(false);
        return;
      }
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectChannel(channel.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card elev-sm" style={{ gap: "var(--space-3)" }}>
      <div className="flex items-center gap-2">
        <span
          className="dot"
          style={{ background: channel.dot ?? "var(--color-accent-500)" }}
        />
        <span style={{ font: "400 17px/1.2 var(--font-heading)" }}>
          {channel.name || "Untitled channel"}
        </span>
        <span
          className={channel.youtube_connected ? "tag tag-accent-2" : "tag tag-outline"}
          style={{ fontSize: 10.5 }}
        >
          {channel.youtube_connected ? "Connected to YouTube" : "Not connected"}
        </span>
        <span
          className="tag tag-neutral"
          style={{ marginLeft: "auto", fontSize: 10.5 }}
        >
          {shortsCount} short{shortsCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {channel.youtube_connected ? (
          <button
            onClick={disconnect}
            disabled={isDisconnecting}
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
          >
            {isDisconnecting ? "Disconnecting…" : "Disconnect from YouTube"}
          </button>
        ) : (
          <a href={`/auth/youtube/connect?channel=${channel.id}`} className="btn btn-secondary" style={{ fontSize: 12 }}>
            Connect to YouTube
          </a>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
        <div className="field">
          <label>Channel name</label>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => set("name")(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Subscribers / summary</label>
          <input
            className="input"
            placeholder="e.g. 128k · 4/wk"
            value={draft.sub}
            onChange={(e) => set("sub")(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Posting cadence</label>
          <input
            className="input"
            placeholder="e.g. 4/wk"
            value={draft.cadence}
            onChange={(e) => set("cadence")(e.target.value)}
          />
        </div>
        <div className="field">
          <label>YouTube channel ID</label>
          <input
            className="input"
            placeholder="UC… (optional — for your reference; connecting via OAuth below is what authorizes uploads)"
            value={draft.youtube_channel_id}
            onChange={(e) => set("youtube_channel_id")(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "var(--color-accent-700)" }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          className="btn btn-primary"
          disabled={!dirty || isSaving}
          onClick={save}
          style={{ fontSize: 12.5 }}
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
        {!confirmDelete ? (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12.5, marginLeft: "auto" }}
            onClick={() => setConfirmDelete(true)}
          >
            Delete channel
          </button>
        ) : (
          <span className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
            <span style={{ fontSize: 11.5 }} className="text-muted">
              Delete permanently?
            </span>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, background: "var(--color-accent-700)" }}
              disabled={isDeleting}
              onClick={remove}
            >
              {isDeleting ? "Deleting…" : "Confirm delete"}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function AddChannelCard() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({
    name: "",
    sub: "",
    cadence: "",
    youtube_channel_id: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  function set<K extends keyof Draft>(key: K) {
    return (v: string) => {
      setDraft((d) => ({ ...d, [key]: v }));
      setError(null);
    };
  }

  function add() {
    startSave(async () => {
      const result = await createChannel(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft({ name: "", sub: "", cadence: "", youtube_channel_id: "" });
      router.refresh();
    });
  }

  return (
    <div
      className="card"
      style={{
        gap: "var(--space-3)",
        border: "2px dashed color-mix(in srgb, var(--color-text) 20%, transparent)",
        background: "transparent",
      }}
    >
      <div style={{ font: "400 17px/1.2 var(--font-heading)" }}>
        Add a channel
      </div>
      <p className="text-muted" style={{ margin: 0, fontSize: 12.5 }}>
        Adds the channel to your workspace so you can import, review, and
        schedule Shorts for it. Connect it to YouTube afterward with the
        button that appears on its card.
      </p>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
        <div className="field">
          <label>Channel name</label>
          <input
            className="input"
            placeholder="e.g. My Real Channel"
            value={draft.name}
            onChange={(e) => set("name")(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Subscribers / summary</label>
          <input
            className="input"
            placeholder="e.g. 12k · 3/wk"
            value={draft.sub}
            onChange={(e) => set("sub")(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Posting cadence</label>
          <input
            className="input"
            placeholder="e.g. 3/wk"
            value={draft.cadence}
            onChange={(e) => set("cadence")(e.target.value)}
          />
        </div>
        <div className="field">
          <label>YouTube channel ID (optional)</label>
          <input
            className="input"
            placeholder="UC…"
            value={draft.youtube_channel_id}
            onChange={(e) => set("youtube_channel_id")(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "var(--color-accent-700)" }}>
          {error}
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ fontSize: 12.5, alignSelf: "flex-start" }}
        disabled={!draft.name.trim() || isSaving}
        onClick={add}
      >
        {isSaving ? "Adding…" : "Add channel"}
      </button>
    </div>
  );
}

export default function ChannelsClient({
  channels,
  shortsCountByChannel,
}: {
  channels: Channel[];
  shortsCountByChannel: Record<string, number>;
}) {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const oauthError = searchParams.get("error");

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 34, margin: "0 0 4px" }}>Channels</h1>
        <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
          Add and manage the channels this workspace organizes Shorts for,
          and connect each one to YouTube for real publishing.
        </p>
      </div>

      {connected && (
        <div className="card" style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)", fontSize: 13 }}>
          Connected to YouTube.
        </div>
      )}
      {oauthError && (
        <div className="card" style={{ background: "var(--color-accent-100)", color: "var(--color-accent-700)", fontSize: 13 }}>
          Couldn&apos;t connect: {oauthError}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {channels.map((c) => (
          <ChannelCard
            key={c.id}
            channel={c}
            shortsCount={shortsCountByChannel[c.id] ?? 0}
          />
        ))}
        <AddChannelCard />
      </div>
    </div>
  );
}
