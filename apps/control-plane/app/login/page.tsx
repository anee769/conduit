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

  const features = [
    "Per-engineer & per-team spend attribution",
    "Egress governance — secrets caught before they leave",
    "Context-rot cost & error-rate observability",
  ];

  return (
    <main className="login-page">
      <div style={{ position: "fixed", top: "1.25rem", right: "1.25rem" }}>
        <ThemeToggle />
      </div>

      <div className="login-layout">
        <div className="login-pitch">
          <span className="logo login-pitch-logo" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 5l6 7-6 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
              <path d="M12 5l6 7-6 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="login-pitch-title">The control plane for your AI coding agents</h2>
          <ul className="login-pitch-list">
            {features.map((f) => (
              <li key={f}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="login-card">
          <div className="login-brand">
            <div>
              <h1>Conduit</h1>
              <div className="sub">Sign in to the dashboard</div>
            </div>
          </div>

          {errorMsg && <div className="login-error" role="alert">{errorMsg}</div>}

          <form method="POST" action="/api/login" className="login-form">
            <input type="hidden" name="next" value={sp.next ?? "/"} />
            <label className="login-label" htmlFor="password">Dashboard password</label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder="••••••••••••"
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
      </div>
    </main>
  );
}
