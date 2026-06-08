"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * First-run setup wizard (MVP_SPEC §13). Detects an empty install, walks the
 * admin through provider credential → team → virtual key, shows the key ONCE
 * with copy-paste base_url snippets, then waits for the first real request.
 */

type Status = {
  empty: boolean;
  org: { id: string; name: string } | null;
  counts: { teams: number; virtualKeys: number; providerCredentials: number; budgets: number };
  steps: { org: boolean; credential: boolean; team: boolean; virtualKey: boolean };
};

export default function SetupWizard() {
  const [adminToken, setAdminToken] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [firstSeen, setFirstSeen] = useState(false);

  const headers = useCallback(
    (): HeadersInit => ({
      "content-type": "application/json",
      ...(adminToken ? { "x-admin-token": adminToken } : {}),
    }),
    [adminToken],
  );

  const [connected, setConnected] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/setup-status", { headers: headers(), cache: "no-store" });
      if (r.status === 401) { setErr("Admin token required."); setConnected(false); return; }
      setErr(null);
      setConnected(true);
      setStatus(await r.json());
    } catch (e) { setErr(String(e)); setConnected(false); }
  }, [headers]);

  // Load a previously-entered admin token so it survives reloads.
  useEffect(() => {
    const saved = window.localStorage.getItem("finops_admin_token");
    if (saved) setAdminToken(saved);
  }, []);

  // Persist the token whenever it changes (cleared field → forget it).
  useEffect(() => {
    if (adminToken) window.localStorage.setItem("finops_admin_token", adminToken);
    else window.localStorage.removeItem("finops_admin_token");
  }, [adminToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Poll for the first request once a key exists.
  useEffect(() => {
    if (!status?.steps.virtualKey || firstSeen) return;
    const t = setInterval(async () => {
      const r = await fetch("/api/usage?days=1", { cache: "no-store" });
      const j = await r.json();
      if ((j?.summary?.requests ?? 0) > 0) { setFirstSeen(true); clearInterval(t); }
    }, 3000);
    return () => clearInterval(t);
  }, [status, firstSeen]);

  async function post(path: string, body: unknown) {
    const r = await fetch(path, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j;
  }

  const [form, setForm] = useState({ orgName: "Acme", provider: "anthropic", apiKey: "", team: "Engineering", keyName: "Engineering key" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function run(step: string) {
    try {
      if (step === "org") await post("/api/admin/orgs", { name: form.orgName });
      if (step === "credential") await post("/api/admin/credentials", { provider: form.provider, displayName: form.provider, apiKey: form.apiKey });
      if (step === "team") await post("/api/admin/teams", { name: form.team });
      if (step === "key") {
        const res = await post("/api/admin/keys", { name: form.keyName });
        setCreatedKey(res.virtualKey);
      }
      await refresh();
    } catch (e) { setErr(String(e)); }
  }

  const s = status?.steps;
  const Check = ({ ok }: { ok: boolean }) => <span className={ok ? "tick on" : "tick"}>{ok ? "✓" : "○"}</span>;

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1>Setup</h1>
          <span className="muted">AI FinOps Gateway · first-run wizard</span>
        </div>
        <a className="win" href="/">Dashboard →</a>
      </header>

      {err && <div className="card error">{err}<div className="muted" style={{ marginTop: 6 }}>If ADMIN_TOKEN is set on the server, paste it below.</div></div>}

      <section className="card">
        <h2>Admin token {connected ? <span className="good">· connected ✓</span> : <span className="muted">(required if ADMIN_TOKEN is set)</span>}</h2>
        <div className="row">
          <input className="in" type="password" placeholder="x-admin-token" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} />
          <button className="btn" onClick={() => void refresh()}>Connect</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Stored in this browser so it persists across reloads. It&apos;s the <code>ADMIN_TOKEN</code> value from your <code>.env</code>.
        </p>
      </section>

      <section className="card">
        <h2>Checklist</h2>
        <ul className="steps">
          <li><Check ok={!!s?.org} /> Organization {status?.org ? <span className="muted">· {status.org.name}</span> : null}</li>
          <li><Check ok={!!s?.credential} /> Provider credential <span className="muted">· {status?.counts.providerCredentials ?? 0}</span></li>
          <li><Check ok={!!s?.team} /> Team <span className="muted">· {status?.counts.teams ?? 0}</span></li>
          <li><Check ok={!!s?.virtualKey} /> Virtual key <span className="muted">· {status?.counts.virtualKeys ?? 0}</span></li>
          <li><Check ok={firstSeen} /> First request seen {firstSeen ? <span className="good">— live!</span> : <span className="muted">— waiting…</span>}</li>
        </ul>
      </section>

      {!s?.org && (
        <section className="card"><h2>1 · Create organization</h2>
          <div className="row"><input className="in" value={form.orgName} onChange={(e) => set("orgName", e.target.value)} /><button className="btn" onClick={() => void run("org")}>Create</button></div>
        </section>
      )}
      {s?.org && !s?.credential && (
        <section className="card"><h2>2 · Add provider credential</h2>
          <div className="row">
            <select className="in" value={form.provider} onChange={(e) => set("provider", e.target.value)}>
              <option value="anthropic">anthropic</option><option value="openai">openai</option><option value="azure">azure</option>
            </select>
            <input className="in" placeholder="provider API key (encrypted on save)" value={form.apiKey} onChange={(e) => set("apiKey", e.target.value)} />
            <button className="btn" onClick={() => void run("credential")}>Save</button>
          </div>
        </section>
      )}
      {s?.credential && !s?.team && (
        <section className="card"><h2>3 · Create team</h2>
          <div className="row"><input className="in" value={form.team} onChange={(e) => set("team", e.target.value)} /><button className="btn" onClick={() => void run("team")}>Create</button></div>
        </section>
      )}
      {s?.team && !s?.virtualKey && (
        <section className="card"><h2>4 · Generate virtual key</h2>
          <div className="row"><input className="in" value={form.keyName} onChange={(e) => set("keyName", e.target.value)} /><button className="btn" onClick={() => void run("key")}>Generate</button></div>
        </section>
      )}

      {createdKey && (
        <section className="card"><h2>Your virtual key (shown once)</h2>
          <pre className="snippet">{createdKey}</pre>
          <h2 style={{ marginTop: "1rem" }}>5 · Point your tools here</h2>
          <pre className="snippet">{`# Claude Code
export ANTHROPIC_BASE_URL=http://your-gateway:4000
export ANTHROPIC_AUTH_TOKEN=${createdKey}

# Codex / OpenAI-compatible
export OPENAI_BASE_URL=http://your-gateway:4000/v1
export OPENAI_API_KEY=${createdKey}`}</pre>
        </section>
      )}
    </main>
  );
}
