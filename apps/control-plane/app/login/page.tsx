import ThemeToggle from "../ThemeToggle";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; retry?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const errorMsg =
    sp.error === "rate"
      ? `Too many attempts. Try again in ${Math.max(1, Number(sp.retry ?? 60))} seconds.`
      : sp.error
        ? "Incorrect password — try again."
        : null;

  return (
    <main className="login-page">
      <div style={{ position: "fixed", top: "1.25rem", right: "1.25rem" }}>
        <ThemeToggle />
      </div>
      <div className="login-card">
        <div className="login-brand">
          <span className="logo" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M5 5l6 7-6 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
              <path d="M12 5l6 7-6 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <h1>Conduit</h1>
            <div className="sub">Sign in to the dashboard</div>
          </div>
        </div>

        {errorMsg && <div className="login-error" role="alert">{errorMsg}</div>}

        <form method="POST" action="/api/login" className="login-form">
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <input
            type="password"
            name="password"
            placeholder="Dashboard password"
            autoFocus
            autoComplete="current-password"
            className="in"
          />
          <button type="submit" className="btn">Sign in</button>
        </form>

        <div className="login-foot">
          On-prem control plane for AI coding agents —{" "}
          <a href="https://getconduit.vercel.app" target="_blank" rel="noreferrer">
            what is this?
          </a>
        </div>
      </div>
    </main>
  );
}
