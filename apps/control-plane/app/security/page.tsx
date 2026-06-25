import Link from "next/link";
import { computePosture } from "../../lib/security-posture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS_COPY: Record<"enforced" | "partial" | "off", { label: string; tone: string }> = {
  enforced: { label: "Enforced", tone: "good" },
  partial: { label: "Partial", tone: "warn" },
  off: { label: "Off", tone: "bad" },
};

export default function Security() {
  const p = computePosture();
  return (
    <div className="app">
      <header className="appbar">
        <div className="brand">
          <div className="logo" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 5l6 7-6 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
              <path d="M12 5l6 7-6 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="brand-name">Conduit</div>
            <div className="brand-sub">Security posture · honest disclosure</div>
          </div>
        </div>
        <nav className="windows">
          <Link href="/" className="win">← Dashboard</Link>
        </nav>
      </header>

      <main className="tabpanel">
        <section className="card">
          <h2>What this dashboard enforces today</h2>
          <table className="posture">
            <thead>
              <tr><th>Control</th><th>Status</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {p.controls.map((c) => {
                const s = STATUS_COPY[c.status];
                return (
                  <tr key={c.label}>
                    <td><b>{c.label}</b></td>
                    <td><span className={`pill pill-${s.tone}`}>{s.label}</span></td>
                    <td className="muted">{c.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>What we have NOT built (yet)</h2>
          <p className="muted small" style={{ marginBottom: ".75rem" }}>
            Listed openly so a security review doesn&apos;t have to discover it.
          </p>
          <ul className="not-built">
            {p.notYetBuilt.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Verifying the claims</h2>
          <ul className="not-built">
            <li><b>Signed images:</b> <code>cosign verify ghcr.io/anee769/conduit-gateway:&lt;tag&gt;</code> (keyless OIDC).</li>
            <li><b>CycloneDX SBOM:</b> attached as a signed cosign attestation on every release. Generate locally with <code>bash scripts/sbom.sh</code>.</li>
            <li><b>Privacy invariant test:</b> the suite asserts the matched secret value never appears in stored events (<code>tests/unit/governance-scan.test.ts</code>).</li>
            <li><b>Full posture whitepaper:</b> <code>SECURITY.md</code> in the repo.</li>
          </ul>
        </section>

        <p className="muted" style={{ textAlign: "center" }}>
          Generated at <code>{p.generatedAt}</code>
        </p>
      </main>
    </div>
  );
}
