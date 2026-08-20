import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        padding: "var(--space-4)",
      }}
    >
      <div style={{ width: "min(380px, 100%)" }} className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: "var(--color-accent)",
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <svg
              width="16"
              height="16"
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
          <div style={{ font: "400 20px/1 var(--font-heading)" }}>
            ContentAdmin
          </div>
        </div>
        <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
          Sign in with a magic link — no password to manage.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
