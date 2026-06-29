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

type Team = { id: string; name: string };
type Key = { id: string; name: string; keyPrefix: string | null; teamId: string | null };

export default function SetupWizard() {
  const [adminToken, setAdminToken] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [keys, setKeys] = useState<Key[]>([]);
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
      // Pull the live team + key lists so the management sections always reflect
      // reality (and so the key form can offer a team dropdown). Best-effort —
      // a 401 here just leaves the lists empty until the admin token is entered.
      const [tr, kr] = await Promise.all([
        fetch("/api/admin/teams", { headers: headers(), cache: "no-store" }),
        fetch("/api/admin/keys", { headers: headers(), cache: "no-store" }),
      ]);
      if (tr.ok) setTeams((await tr.json()).teams ?? []);
      if (kr.ok) setKeys((await kr.json()).keys ?? []);
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
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function run(step: string) {
    try {
      if (step === "org") await post("/api/admin/orgs", { name: form.orgName });
      if (step === "credential") await post("/api/admin/credentials", { provider: form.provider, displayName: form.provider, apiKey: form.apiKey });
      if (step === "team") await post("/api/admin/teams", { name: form.team });
      if (step === "key") {
        // Attribute the key to a team. Default to the first team when the
        // dropdown hasn't been touched, so a wizard-driven key is NEVER created
        // unassigned (the old bug). Only omit teamId if no team exists at all.
        const teamId = selectedTeam || teams[0]?.id;
        const res = await post("/api/admin/keys", { name: form.keyName, ...(teamId ? { teamId } : {}) });
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
          <span className="muted">Conduit · setup &amp; team / key management</span>
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
      {/* Teams — always available once a credential exists, so you can add a
          2nd / 3rd team any time (not just during first-run). */}
      {s?.credential && (
        <section className="card">
          <h2>Teams <span className="muted">· {teams.length}</span></h2>
          {teams.length > 0 && (
            <ul className="steps" style={{ marginBottom: ".75rem" }}>
              {teams.map((t) => <li key={t.id}><span className="tick on">✓</span> {t.name}</li>)}
            </ul>
          )}
          <div className="row">
            <input className="in" placeholder="Team name (e.g. Data Platform)" value={form.team} onChange={(e) => set("team", e.target.value)} />
            <button className="btn" onClick={() => void run("team")}>Add team</button>
          </div>
        </section>
      )}

      {/* Virtual keys — always available once a team exists. Each key is
          attributed to a team (the dropdown), so spend never lands in
          "Unassigned". */}
      {s?.team && (
        <section className="card">
          <h2>Virtual keys <span className="muted">· {keys.length}</span></h2>
          {keys.length > 0 && (
            <ul className="steps" style={{ marginBottom: ".75rem" }}>
              {keys.map((k) => {
                const team = teams.find((t) => t.id === k.teamId);
                return (
                  <li key={k.id}>
                    <span className="tick on">✓</span> {k.name}
                    <span className="muted"> · {k.keyPrefix ?? "vk_live_…"} · {team ? team.name : "Unassigned"}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="row">
            <input className="in" placeholder="Key name (e.g. priya — claude-code)" value={form.keyName} onChange={(e) => set("keyName", e.target.value)} />
            <select className="in" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
              <option value="">{teams[0] ? `Team: ${teams[0].name} (default)` : "No team"}</option>
              {teams.map((t) => <option key={t.id} value={t.id}>Team: {t.name}</option>)}
            </select>
            <button className="btn" onClick={() => void run("key")}>Generate key</button>
          </div>
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
