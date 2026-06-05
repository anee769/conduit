# Phase-1 Consolidation Checklist

Goal: take the feature-complete MVP from "runs on my laptop" to "credible,
demo-able, self-hostable product" — ready to put in front of a design partner.

Status legend: ✅ done · 🚧 in progress · ⬜ todo

---

## Done this migration (new Mac)

- ✅ Full stack runs on macOS (Postgres + ClickHouse + Redis + mock + gateway + control-plane)
- ✅ All **37 tests pass** (21 unit + 16 system)
- ✅ `scripts/run-tests.sh` — bash port of `run-tests.ps1` (full suite in one command)
- ✅ `scripts/seed-demo.sh` — clean, repeatable demo data (model mix + cache savings)
- ✅ Light-themed dashboard, verified end-to-end with real metered traffic
- ✅ Initial commit + clean personal git identity

---

## Remaining — ordered by pitch impact

### 🔴 High (do before any partner sees it)

- [ ] **Real before/after cost numbers.** Point the gateway at `api.anthropic.com`,
      store a real key as a credential, run a live Claude Code session through it
      (`ANTHROPIC_BASE_URL=http://localhost:4000`, `ANTHROPIC_AUTH_TOKEN=<vk>`),
      and record actual spend + cache savings. *This is the single strongest pitch artifact.*
- [ ] **Push to private GitHub** under the personal account. Clean ownership; shareable.

### 🟡 Medium (rough edges a partner will notice)

- [ ] **Basic dashboard auth.** The dashboard is currently fully open. Add a minimal
      gate (shared password / basic auth / reuse `ADMIN_TOKEN`). Full SSO/RBAC is Phase 2.
- [ ] **Isolate tests from demo data.** System tests write orgs + usage into the same
      stores as the demo. Point them at a separate DB/namespace (or auto-clean) so the
      demo dashboard stays pristine.

### 🟢 Low (hardening / polish)

- [ ] **CI:** wire `run-tests.sh` into `.github/workflows/ci.yml`; gate on 37/37.
- [ ] **Clean install doc:** verify a fresh clone → running stack using only the README
      (macOS/bash, not PowerShell). Fix any gaps.
- [ ] **Build the Docker images:** `docker-compose --profile app` config is validated but
      the images were never actually built/run. Build + smoke-test both.

---

## Known non-issues (investigated, no action needed)

- **Blank-model rows in early demo data** were caused by an ad-hoc traffic loop running
  under **zsh** (1-indexed arrays → `${models[0]}` empty → `"model":""` sent). The gateway
  faithfully recorded what the client sent — no product bug. `seed-demo.sh` avoids it.
