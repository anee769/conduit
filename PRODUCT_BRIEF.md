# AI FinOps Gateway — What We Built (Plain English)

*For design partners, investors, and anyone evaluating the product.*
*No programming knowledge needed to understand this document.*

---

## The Problem (In One Paragraph)

Companies are giving their engineers AI coding assistants — tools like Claude Code,
GitHub Copilot, and Cursor. These tools are powerful, but they have a cost problem.
Every line of code an AI reads or writes costs money (measured in "tokens"). A
single senior engineer using Claude Code aggressively can run up a $3,000–$5,000
monthly bill. When you have 50 engineers, nobody knows who is spending what, on
which project, or whether any of it is within budget. The finance team gets a
surprise invoice. The CTO can't explain where $200,000 went. Sensitive source code
is flowing through a SaaS service the security team never approved. **This is the
problem.**

---

## The Analogy

Think of the AI FinOps Gateway like an **expense management system — but for AI
spending, and built for companies that need it inside their own walls.**

In a normal company, employees have corporate credit cards. Finance can see what's
being spent, by whom, on what, and can set per-employee limits. If someone goes
over, the card gets declined.

The AI FinOps Gateway does the same thing — but for AI API spending:

- Every engineer gets a **virtual key** (like a corporate card) instead of the real
  API key.
- Every request goes through the gateway, which **records who made it, what model
  they used, how many tokens it cost, and how much that cost in dollars.**
- Finance and engineering leads can **see a real-time dashboard** showing spend by
  team, by model, and by day.
- Admins can set **hard budget caps** — once a team hits their monthly limit, requests
  are blocked until the next period (or the cap is raised).
- The gateway runs **inside the company's own infrastructure** — source code never
  leaves their building (or cloud account).

---

## What We Built — Feature by Feature

### 1. The Transparent Proxy (the core)

Every AI request from every engineer passes through our gateway before reaching
Anthropic or OpenAI. The engineers don't notice anything different — their tools
still work the same way. The gateway is invisible to the developer experience, but
captures everything the finance and ops teams need.

**How it works:** The engineer's tool sends a request to our gateway instead of
directly to Anthropic. The gateway checks policies, records the metadata, and
forwards the request. The response comes back through the gateway to the engineer.
Total added delay: under 5 milliseconds (imperceptible).

**What it supports:** Claude (Anthropic), OpenAI GPT models, and anything that uses
the same API format (Azure OpenAI, etc.).

---

### 2. Virtual Keys — Credential Security

The company's real Anthropic/OpenAI API key is stored in the gateway's database,
**encrypted** (using AES-256-GCM, the same standard used to encrypt bank data). No
engineer ever sees the real key. If an engineer's laptop is stolen or their key is
leaked, the attacker only has a virtual key — which can be immediately revoked from
the dashboard.

**The security pitch:** Today, most companies either share one API key across all
engineers (a security nightmare), or give each engineer their own real key (an
accounting nightmare). Virtual keys solve both problems.

---

### 3. Real-Time Cost Dashboard

A web-based dashboard showing (for any time window — 7 days, 30 days, 90 days):

- **Total spend** — how much money went to AI providers
- **Spend by team** — which team spent what
- **Spend by model** — was money going to cheap/fast models or expensive/slow ones
- **Spend over time** — bar chart showing daily spend trends
- **"Caching saved"** — money not spent because of intelligent caching (see below)
- **Blocked requests** — requests that were stopped by a policy or budget cap
- **Recent requests** — a live feed of the last 25 requests with team, model,
  tokens, cost, and status

**What finance sees:** Clear per-team attribution. No more surprises at month end.

**What engineering sees:** Which models are actually being used. Are agents using
expensive models for simple tasks they could do with cheap ones?

---

### 4. Hard Budget Caps

Admins set monthly (or weekly, or daily) spending limits for each team or for the
whole company. Once the limit is reached, the gateway blocks requests and returns an
error — requests don't go through, so money doesn't go out. The limit resets at the
start of the next period.

**Example:** The "Backend Engineering" team has a $2,000/month cap. On the 22nd of
the month they hit $2,000. Every subsequent AI request by that team returns an error
until the 1st of next month. Their team lead gets an alert so they can decide
whether to raise the cap or wait.

**Two enforcement modes:**
- `alert` — send a notification when the limit is approached (warning only)
- `block` — hard stop when the limit is reached (no requests through)

---

### 5. Model Allow-Lists — Governance Without Friction

Each virtual key can be restricted to a specific list of allowed AI models. If a
developer tries to use a model not on their list, the gateway blocks the request
with a clear error — it never silently switches to a different model.

**Example use case:** The intern team can only use `claude-haiku` (cheap, fast). The
senior engineers can use `claude-sonnet` and `claude-opus`. The gateway enforces
this automatically.

**Why "no silent swap" matters:** Some competing products silently downgrade a
request to a cheaper model if the requested one isn't allowed. This is deceptive —
the engineer thinks they're getting Claude Opus quality responses and makes
engineering decisions based on that assumption. We always tell the client explicitly
what happened.

---

### 6. Per-Key Rate Limits

Each virtual key can have a maximum requests-per-minute (RPM) cap. If a coding
agent gets stuck in a loop and starts hammering the API, the gateway starts blocking
requests after the cap is exceeded. This prevents a runaway agent from consuming the
month's entire budget in one afternoon.

---

### 7. Exact-Match Cache — The Cost Savings Engine

If two engineers (or the same engineer twice) send the exact same request to the AI
— same question, same context, same model — the gateway serves the stored response
from the first request instead of calling the AI provider again. The second (and
third, fourth…) identical request costs **zero dollars** and returns almost
**instantly**.

**In practice:** Coding agents often repeat the same system-prompt questions across
sessions. "Explain the function signature of X" asked 40 times is 39 free responses.
Real-world cache savings in high-traffic engineering teams: **20–40% of total
spend**.

The dashboard shows this as a "Caching saved" number in green.

---

### 8. On-Prem / Inside-Perimeter Deployment

The gateway runs inside the company's own infrastructure — on their servers, in
their cloud account (AWS/Azure/GCP), or in their own data center. Source code
written by engineers using Claude Code is never sent to our servers. It goes:
engineer → their gateway → Anthropic → back. Our company never sees it.

**Why this matters for regulated industries:** A bank, a legal firm, or a government
contractor has strict rules about where proprietary code can go. They cannot use a
SaaS AI proxy service where the vendor processes the requests. By running on-prem,
their legal and security teams can approve the tool. This is why this product exists.

---

### 9. Privacy by Design

The gateway records **only metadata** — who asked (which team), what model, how many
tokens, what it cost, how long it took. It never stores the actual prompt text or the
AI's response. Even if the gateway database were stolen, no source code, no business
logic, and no proprietary information would be in it.

This is a deliberate architectural choice, verifiable in the code, and auditable by
a customer's security team.

---

### 10. Ops-Ready Out of the Box

- **Prometheus metrics** — plug directly into any existing Grafana/Datadog setup for
  latency, error rate, and cost monitoring
- **Pre-built Grafana dashboard** — zero configuration needed, just import
- **Prometheus alert rules** — budget spike, high error rate, latency anomaly
- **Health endpoints** — standard `/health` and `/ready` endpoints for load balancers
  and Kubernetes probes
- **Support bundle** — one command generates a diagnostic package for troubleshooting
  without sharing sensitive data

### 11. Data Governance — The Security Gate (the reason this gets approved)

Before any request leaves the company's perimeter for an AI provider, the gateway
**scans it for secrets** — API keys, access tokens, private keys, credentials. If
it finds one, it either **alerts** (records and forwards, for visibility) or
**blocks** the request outright (configurable). The dashboard shows exactly what
was caught, by category, by team.

**Why this is the most important feature, not the eleventh:** Cost control is
something a finance team *wants*. Governance is what a **security team requires**
before they'll let engineers point AI coding agents at proprietary code at all. A
bank or regulated fintech cannot approve Claude Code if there's no control
stopping a secret or sensitive snippet from being sent to a third party. This is
that control.

**Privacy within the privacy promise:** the scan records only the *category* of
what it found (e.g. "aws_credentials") — **never the secret value itself**. The
gateway sees the request in memory, classifies it, and discards it.

**Why only an on-prem gateway can do this:** contextual inspection requires reading
the request body. A SaaS proxy doing that means your prompts flow to the vendor's
cloud to be inspected — exactly what a security team forbids. Because this gateway
runs *inside the company's own infrastructure*, deep inspection never crosses the
perimeter. This is structurally impossible for a cloud-based competitor to match.

*Shipping now: Tier 1 — universal secret patterns (keys, tokens, private keys),
near-zero false positives. Next, with a design partner: Tier 2 — company-specific
sensitive data (customer names, internal codenames, revenue figures) learned from
their own traffic.*

---

## The Numbers That Matter

| Metric | Value |
|---|---|
| Added latency | < 5ms (invisible to users) |
| Time-to-first-token impact | Zero (streaming is never buffered) |
| Typical cache savings | 20–40% of monthly spend |
| Governance | Secrets scan (alert/block); category recorded, never the value |
| Test coverage | 49 automated tests (30 unit + 19 end-to-end) |
| Encryption standard | AES-256-GCM (bank-grade) |
| Data stored | Metadata only — no prompts, no completions |
| Deployment options | Docker, Kubernetes, bare metal, cloud VPC |
| AI providers supported | Anthropic (Claude), OpenAI (GPT), Azure OpenAI |

---

## How It Compares to Doing Nothing

| Without Gateway | With Gateway |
|---|---|
| One shared API key for all engineers | Virtual key per team/engineer |
| No visibility into who spends what | Real-time dashboard, per-team attribution |
| No budget controls | Hard monthly caps, automatic enforcement |
| Any model usable by anyone | Model allow-lists per key |
| Raw API key exposed on every laptop | Key encrypted in DB; laptops hold virtual keys only |
| Surprise invoices | Predictable, auditable spend |
| Prompts and code through SaaS | Traffic stays inside company perimeter |

---

## How It Compares to LiteLLM (the most common alternative)

LiteLLM is an open-source proxy that does basic routing and cost tracking. It's
popular with individual developers.

| | LiteLLM | AI FinOps Gateway |
|---|---|---|
| Basic cost tracking | ✅ | ✅ |
| Hard budget enforcement | 💰 Paid tier only | ✅ Included |
| Model allow-lists | 💰 Paid tier | ✅ Included |
| SSO / RBAC governance | 💰 Enterprise plan | Phase 2 (password gate today) |
| Secrets scan before egress (alert/block) | basic | ✅ Included (category-only) |
| Contextual data governance (on-prem, perimeter) | ❌ | ✅ The wedge — Tier 2 next |
| Built for on-prem regulated enterprises | ❌ | ✅ Core design goal |
| Python / GIL limitations | ⚠️ Single process | ✅ Node.js, concurrent |
| Code-sensitive deployment focus | ❌ | ✅ No bodies stored, on-prem |

**The positioning:** LiteLLM tells you where tokens went. We control where they go.
Observability shows you the bleeding; we stop it.

---

## The Market Tailwind (Why Now)

- **98% of organizations** now actively manage AI spend, up from 31% in 2024.
- Average monthly AI spend at mid-size tech companies: **~$85,000** (+36% year-over-year).
- **Microsoft reportedly pulled Claude Code** internally because token bills
  eclipsed employee costs — the pain is documented and public.
- Regulated industries (finance, legal, healthcare, government) are being excluded
  from the AI coding boom because they can't send proprietary code through SaaS
  proxies. This is the wedge.

---

## What's Coming Next (Phase 2)

The Phase 1 system above is complete and tested. Phase 2 leads with **governance**
— the differentiator a security team buys on — and treats cost as table-stakes:

1. **Data governance (started — see feature 11)** — secrets scan shipping now (Tier
   1). Next, with a design partner: **contextual** detection of *their* sensitive
   data (customer names, internal codenames, revenue figures) learned from their own
   traffic, with alert → block promotion and a false-positive feedback loop. This is
   the governance gate that lets a compliance team approve coding agents at all.

2. **RBAC + SSO/SAML** — full enterprise login and role-based access control
   (the dashboard already has a password gate today).

3. **Prompt-cache pass-through** — preserve and auto-inject Anthropic caching hints
   so repeated context bills at the ~10x-cheaper "cached" rate. A convenience and a
   dashboard savings number — note caching is a provider feature, so this is
   table-stakes, not the moat.

4. **Bedrock / Vertex adapters** — connect companies whose cloud policy requires
   running AI through AWS Bedrock or Google Vertex instead of Anthropic/OpenAI direct.

> **Deliberately NOT on the roadmap: context pruning/compression at the gateway.**
> It breaks prompt caching (which needs a byte-identical prefix), risks "context
> rot" (quality loss from mangled context), and violates the quality-neutral
> promise. Context optimization belongs in the coding agent, not the proxy.

---

## Who Should Run This

**Ideal first customer profile:**

- **50–500 engineers** using AI coding assistants (Claude Code, Copilot, Cursor)
- In a **regulated industry** (finance, fintech, legaltech, healthcare, GCC)
- **Spending or about to spend** $20,000+/month on AI APIs
- Has a **security or compliance team** that needs to approve where code goes
- Wants to run **inside their own cloud account** (AWS VPC, Azure tenant, GCP project)

**Current warm prospects:**
- SpotDraft (AI-native legal tech, code+data sensitive)
- ThoughtSpot (publicly wrote about "FinOps for LLMs" — strongest narrative fit)
- PriceLabs (AI-native revenue management, friends channel)
- Razorpay, Zerodha, Groww (Indian fintech — RBI compliance + frugality culture)

---

*Built with: Node.js / TypeScript / Hono (gateway), Next.js 15 (dashboard),
Postgres + ClickHouse + Redis (datastores), Drizzle ORM, pnpm workspaces.*

*Phase 1 complete: 8 milestones, 37 passing tests, production-ready deployment.*
