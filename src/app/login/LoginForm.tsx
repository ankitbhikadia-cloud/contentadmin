"use client";

import { useState, useTransition } from "react";
import { sendMagicLink } from "./actions";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await sendMagicLink(email);
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (sent) {
    return (
      <div className="card elev-sm" style={{ gap: "var(--space-2)" }}>
        <div className="card-kicker">Check your email</div>
        <p style={{ margin: 0, fontSize: 14 }}>
          We sent a sign-in link to <strong>{email}</strong>. Open it on this
          device to get in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          className="input"
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && (
        <div style={{ fontSize: 13, color: "var(--color-accent-700)" }}>
          {error}
        </div>
      )}
      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={isPending}
      >
        {isPending ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
