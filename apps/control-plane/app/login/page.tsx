export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="wrap">
      <div className="card" style={{ maxWidth: 380, margin: "12vh auto" }}>
        <div className="brand" style={{ marginBottom: "1rem" }}>
          <div className="logo">◆</div>
          <div>
            <div className="brand-name">AI FinOps Gateway</div>
            <div className="brand-sub">Sign in to the dashboard</div>
          </div>
        </div>
        {sp.error && (
          <p style={{ color: "var(--bad)", fontSize: "0.85rem", margin: "0 0 0.6rem" }}>
            Incorrect password — try again.
          </p>
        )}
        <form method="POST" action="/api/login" className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
            className="in"
          />
          <button type="submit" className="btn" style={{ marginTop: "0.6rem" }}>
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
