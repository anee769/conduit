# Conduit — Security & Architecture Whitepaper

*For the security, GRC, and procurement teams evaluating Conduit. This document is
meant to answer the questions a regulated security review asks — up front, before
you have to ask them. Last updated: 2026-06.*

> **One-sentence summary:** Conduit is a self-hosted AI gateway that runs **entirely
> inside your own cloud account**. Your code, prompts, provider keys, and traffic
> never leave your perimeter and never reach the vendor. We sell you the software,
> support it, and ship signed, SBOM-attested releases — we do **not** host your data.

---

## 1. Deployment model — this is not SaaS

Conduit is delivered as container images you run in **your** environment (VPC, K8s
cluster, or a single VM). There is **no vendor-operated component in the request
path**, and **no phone-home**:

- The data plane (gateway), the control plane (dashboard/admin API), and all three
  datastores (Postgres, ClickHouse, Redis) run inside your account.
- The only outbound network calls Conduit makes are to **the LLM provider
  endpoints you configure** (e.g. `api.anthropic.com`, your Bedrock/Azure
  endpoint) and an **optional** alert webhook **you** set. Nothing is sent to the
  vendor.
- Conduit can run **fully air-gapped** from the vendor. There is no license-call,
  telemetry beacon, or update check that contacts us. (Updates are pulled by you,
  on your schedule, from signed images — see §7.)

If your "perimeter" is an AWS VPC, Conduit deploys there (ECS task / EKS pod /
sidecar). Same trust model, your infrastructure.

## 2. Data-flow diagram

```mermaid
flowchart LR
    subgraph YOUR["YOUR CLOUD ACCOUNT / PERIMETER"]
        dev["Engineer<br/>(Claude Code / Cursor)"]
        subgraph CONDUIT["Conduit (self-hosted)"]
            gw["Gateway<br/>(data plane)"]
            cp["Control plane<br/>(dashboard/admin)"]
            pg[("Postgres<br/>config · keys(enc) · budgets")]
            ch[("ClickHouse<br/>usage events — METADATA ONLY")]
            rd[("Redis<br/>cache · counters")]
        end
    end
    prov["LLM Provider<br/>(Anthropic / OpenAI /<br/>Bedrock / Azure)"]

    dev -->|"virtual key"| gw
    gw -->|"real key injected"| prov
    prov -->|"streamed response"| gw
    gw -->|"response (untouched)"| dev
    gw -.->|"token/cost metadata"| ch
    gw -.-> rd
    gw -->|"decrypt cred"| pg
    cp --- pg
    cp --- ch
```

**The vendor (Conduit) appears nowhere in this diagram.** Traffic flows
engineer → Conduit (in your account) → provider, and back.

## 3. What is and isn't stored

| Data | Stored? | Where | Notes |
|---|---|---|---|
| Prompt bodies | **No** | — | Never persisted. Inspected in memory, then discarded. |
| Completion bodies | **No** | — | Never persisted (except the optional exact-match cache, which stores a 2xx response body in Redis keyed to an identical request, TTL-bound, and which you can disable). |
| Provider API keys | Yes (encrypted) | Postgres | AES-256-GCM sealed; see §4. |
| Usage metadata | Yes | ClickHouse | Who/when/model/tokens/cost/status/latency — **metadata only**. |
| Governance findings | Yes (category only) | ClickHouse | The detected **category** (e.g. `aws_credentials`), **never the matched secret value**. |
| Virtual keys | Yes (hashed) | Postgres | SHA-256 of the secret; the plaintext key is shown once and never stored. |

**Privacy invariant:** Conduit records metadata about requests, never their
content. The governance scanner (§5) is explicitly designed so the matched
sensitive value is *never* written to any store or log — only its category.

## 4. Cryptography & secret handling

- **Provider credentials** are sealed at rest with **AES-256-GCM** (authenticated
  encryption) using a `MASTER_ENCRYPTION_KEY` you supply (32-byte, base64). The
  placeholder key is rejected at boot. Ciphertext is `iv:tag:ciphertext`; each
  encryption uses a fresh random IV; tampering fails the GCM auth tag (unit-tested).
- **Virtual keys** are stored only as SHA-256 hashes. The raw `vk_live_…` is shown
  once at creation and never persisted.
- The master key lives in your secret manager / environment, never in the database
  or images.
- Provider keys are decrypted **in memory, on the request path only**, injected
  into the upstream call, and never logged.

## 5. Data-governance (egress control)

Before a request can leave your perimeter for a provider, Conduit runs a
**pure, in-memory secrets scan** (T1) on the request body:

- Detects API keys, tokens, private-key blocks, and credential patterns.
- Two actions: **alert** (record the category and forward) or **block** (reject
  with HTTP 451 before the request reaches the provider).
- A **per-category promote-to-block** feedback loop: run in alert, observe the
  false-positive rate per category, then enforce high-confidence categories one at
  a time (`GOVERNANCE_BLOCK_CATEGORIES`).
- **Only the category is recorded — never the value.** This is verified by an
  explicit test asserting the secret string never appears in `usage_events`.

The scan is synchronous and sub-millisecond; it is the only added latency on the
hot path, and it is opt-in.

## 6. Authentication & failure modes

- **Virtual-key auth fails CLOSED:** if the identity backend (Postgres) is
  unavailable, requests are rejected (503) rather than passed through unauthenticated.
- **Known budget overages fail CLOSED** (402). Other control-plane degradations
  follow a configurable `FAIL_MODE` (open|closed) so you choose availability vs.
  strictness for *your* risk posture.
- The admin API and the gateway reload endpoint are guarded by `ADMIN_TOKEN`.
- The dashboard UI is gated by a password (`DASHBOARD_PASSWORD`); the cookie holds
  a salted SHA-256 token, never the password.
- The prompt/completion bodies are never written to logs — logs are metadata only.

## 7. Supply chain & release integrity

- **Signed images:** release images are signed with **Sigstore cosign** (keyless /
  OIDC); you can verify provenance before deploying (`cosign verify …`).
- **SBOM:** every release ships a **CycloneDX/SPDX SBOM** (generated with Syft), so
  your team can inventory and scan dependencies. Generate one yourself any time
  with `scripts/sbom.sh`.
- **Vulnerability scanning:** images are scanned (Grype/Trivy) in CI.
- **Lean dependency surface:** the gateway (hot path) is deliberately
  zero-heavy-dependency — ClickHouse and cache use plain `fetch`/`ioredis`, not a
  driver stack — which shrinks the attack surface on the component that sees your
  traffic.
- **CVE-patching commitment (design-partner / commercial):** we monitor
  dependencies for advisories and ship patched releases for High/Critical CVEs
  affecting Conduit within a committed window (defined in the support agreement).

## 8. Tenancy & data isolation

Every record carries an `org_id` tenant key, even in single-tenant on-prem
deployments, so multi-team isolation is enforced at the data layer from day one.

## 9. Testing & change control

- **61 automated tests** (unit + live-system), run on every PR and push via CI
  (`.github/workflows/ci.yml`): typecheck, crypto round-trips, governance
  privacy invariant, AWS SigV4 verified against the published AWS test vector,
  auth/budget/rate-limit/cache behavior end-to-end.
- Branch flow: feature → `dev` → `master`; CI must pass before merge.

## 10. What Conduit is NOT (scope honesty)

- **Not a SaaS.** We never see your data (§1).
- **Not self-hosted inference.** Conduit proxies frontier providers; it does not
  run models. (Your model choice and contract with the provider are unchanged.)
- **Not a model-quality modifier.** Transparent proxy: the request body is never
  altered except where a provider's own API requires it (Bedrock body shaping);
  there is no silent model downgrade — a disallowed model is a clear 403.
- **No prompt/completion retention** (§3). Any future content-retaining feature
  would be explicit, per-policy, and opt-in.

## 11. Coordinated vulnerability disclosure

Report security issues to **security@<your-domain>** (PGP key on request). We
acknowledge within 2 business days and coordinate disclosure with you.

---

*This document is provided to support your security review. A completed
CAIQ/SIG-lite questionnaire and a data-flow diagram in your preferred format are
available on request. SOC 2 Type II is on the roadmap; until then we will support
your audit with the artifacts above and direct engineering access.*
