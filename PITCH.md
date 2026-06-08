# Conduit — Pitch

*The control plane for all your AI workloads — cost, budgets, and data-governance,
inside your own perimeter. Starting with the most sensitive: AI coding agents.*

---

## The one-liner

**Conduit is a self-hostable gateway that sits between everything in your company
that calls an LLM — AI coding agents, production agentic workflows, RAG apps,
internal copilots — and the providers behind them. One unbypassable chokepoint for
cost control, budgets, credential security, and data-governance, deployed inside
your own cloud so proprietary code and sensitive data never leave your perimeter.**

We **land on AI coding agents** (Claude Code, Copilot, Cursor) — the sharpest,
most code-sensitive entry point, where regulated buyers are excluded today — and
**expand to govern every LLM workload in the org.**

Sound bite: *"Observability tools show you the bleeding. We stop it."*

---

## The problem

Companies now run LLMs everywhere — coding agents on every developer's machine,
**and** production agentic workflows, RAG apps, and internal copilots touching
customer data. The same three problems land across all of it:

1. **Cost is invisible and unbounded.** One heavy Claude Code user burns
   $3,000–5,000/month; a production agent looping on the wrong model can burn far
   more. Across teams it's a surprise six-figure invoice nobody can attribute.
2. **Sensitive data leaves the building.** Proprietary source and secrets (coding
   agents) and customer PII and business data (production agents) flow through
   third-party APIs the security team never signed off on.
3. **There's no control surface.** One shared API key, no budgets, no model
   allow-lists, no rate limits, no kill switch for a runaway agent — and no way to
   enforce any of it that a developer or a service can't bypass.

For a **regulated company** — a bank, a fintech, a GCC — problem #2 is
disqualifying. They often **can't adopt AI coding agents at all**, because they
cannot send proprietary code to a SaaS service their compliance team can't approve.
The same wall blocks customer-facing agentic workflows. That exclusion is the opening.

And a **blanket ban doesn't remove the risk — it hides it.** Validated repeatedly by
practitioners across regulated orgs: ban the approved tools and engineers move to
personal accounts with prod code pasted in. The real choice is **governed AI vs.
shadow AI**, not AI vs. no-AI.

---

## The insight (why this is a real wedge, not another dashboard)

Everyone is shipping an "AI cost dashboard." But **cost control is table-stakes.**
Prompt caching and batch discounts are *provider* features any team can switch on;
context optimization is *client-side*. A buyer can DIY every cost lever.

**The perimeter is table-stakes too — and increasingly believed solved.** The
consensus answer from regulated practitioners is now *Bedrock / Vertex / Azure
OpenAI private endpoint + a no-train contract or BAA.* That secures the channel to
the vendor. So we **don't** lead with "data never leaves your perimeter" — we
concede it, and sit **in front of** Bedrock/Azure.

Because the half nobody has solved is the **internal control plane.** Cloud-hosted
models + contracts give you **zero** of: per-team/per-user spend attribution,
budget caps, model allow-lists, secret/PII egress detection, or an audit trail of
what was actually sent. Every practitioner who got specific revealed this exact gap
— *"each space uses the same IAM role, so we can't break down billing by user";*
*"no audit trail of what the agent touched or decided."* That's the defensible
territory: control, not channel.

And it has a unique property: a real control plane is **both impossible *without* a
gateway AND impossible *from a SaaS* gateway** — the inspection has to happen inside
the perimeter. So it can only run **on-prem, inside the customer's own cloud
account.** That's the moat. Cost gets us the meeting; the control plane is why you
can't replicate us with a Bedrock endpoint and a contract.

That same unbypassable-chokepoint property is exactly why this isn't a coding-only
tool. **Production agentic workflows need it more, not less** — they run
autonomously, at higher volume, touching customer PII, with no human in the loop to
catch a leak or a runaway bill. A control point the developer *or the service*
can't disable is the only place org policy is actually real. Coding agents are the
beachhead; **every LLM workload in the org is the territory.**

---

## The product

A single gateway you deploy in **your own VPC**. Every AI request from every
engineer flows through it:

- **Virtual keys** — the real provider key is encrypted in the gateway; engineers
  hold a revocable virtual key. No raw credential on any laptop.
- **Real-time spend + attribution** — dashboard by team, model, day, **and virtual
  key** (per-engineer / per-service); plus an **exportable audit log** (CSV/JSON,
  metadata-only) for security reviews.
- **Hard budget caps** — fail-closed; a team hits its cap, requests stop.
- **Model allow-lists** — no silent downgrade; a disallowed model is a clear 403.
- **Per-key rate limits** — a stuck agent can't burn the month overnight.
- **Data-governance scan** — detects API keys, tokens, private keys, and
  credentials *before* they leave the perimeter. Alert or block, with a
  **per-category feedback loop**: run in alert, watch the false-positive rate, then
  promote high-confidence categories to block one at a time. **Records the category,
  never the value.**
- **Sits in front of what you already use** — direct Anthropic/OpenAI, **or AWS
  Bedrock (SigV4) / Azure OpenAI**: configure that credential and the org routes
  through it with no client change.
- **Privacy by design** — metadata only; never your prompts or completions.
  Inspection happens in memory, inside your perimeter, and is discarded.

**Works with anything that calls an LLM** — Claude Code, Codex, Cursor, agent
harnesses like Pi and OpenClaw, *and* your own production agents, RAG pipelines,
and internal copilots. It's an OpenAI-/Anthropic-compatible endpoint: point the
base URL at Conduit; nothing else changes. One chokepoint for every LLM call in
the org. Overhead < 5ms; streaming is never buffered.

---

## Why now

- **98% of organizations now actively manage AI spend**, up from 31% in 2024.
- AI-coding spend is compounding; the pain is public (Microsoft reportedly pulled
  Claude Code internally when token bills eclipsed headcount cost).
- **Regulated industries are being locked out** of the AI-coding boom because they
  can't route code through SaaS — and that exclusion is the opening.
- Competitors deploying on-prem (Harness, Repello/Argus) **validate the demand** —
  the category is forming right now.

---

## The honest competitive read

The space is crowding. Cost gateways (LiteLLM, Kong, TrueFoundry, Portkey,
Databricks) and AI-security guardrails (Repello/Argus, Lakera) both have on-prem
players. *"On-prem AI gateway"* is becoming a category, not a moat.

**So we don't compete on "we have a gateway." We own a specific intersection
nobody holds cleanly:**

> **Unified FinOps cost-control + egress data-governance, for code-sensitive
> engineering teams, inside their own perimeter — built for the regulated India /
> GCC market.**

- The cost gateways don't do contextual egress-governance.
- The security tools (Argus) do guardrails for AI *apps* (prompt injection,
  jailbreaks) but **no cost, budgets, virtual keys, or spend attribution.**
- The SaaS players structurally can't offer perimeter inspection.
- **Bedrock / Azure private endpoints are not a competitor — they're a substrate.**
  They solve vendor-trust; they leave the control plane empty. Conduit sits *in
  front* of them: *"Already on Bedrock? Good — put Conduit in front of it for the
  attribution, budgets, and egress controls you still don't have."*

We win on **focus** (a purpose-built tool, not a feature bundled into a platform),
**speed**, a **specific underserved buyer**, and **time-to-yes**. The currency in a
regulated buy isn't features — it's how fast security/compliance says yes. The
field signal is explicit: *"compliance signed off faster than expected because the
governance story was built in instead of bolted on."* Conduit is the artifact that
makes the security review short — virtual keys, egress scan, audit, metadata-only,
running in their VPC, every question answered before it's asked.

### Land and expand

- **Act 1 — land on coding agents.** Sharpest pain, most code-sensitive data,
  cleanest governance story (T1 secrets), regulated buyers excluded today. Narrow
  on purpose — focus is how you win a crowded field.
- **Act 2 — expand to all AI workloads.** Once Conduit is the chokepoint, every
  other LLM call in the org flows through it: production agents, RAG, internal
  copilots, batch. Contextual governance (T2 — customer names, PII, revenue) is
  *more* relevant here than in coding, and the per-customer policy compounds.
- **Adjacency to watch:** production agents also need adversarial runtime security
  (prompt injection, jailbreaks — the Argus/Repello category). That's a
  partner-or-extend lane in Act 2, not an Act-1 fight. Keeping the entry on coding
  agents avoids dragging the whole runtime-security problem into the first sale.
- **Frontier to watch (Act 3):** agent-action audit — not just *that* data left,
  but *what the agent touched or decided* and the reasoning chain behind a change.
  Practitioners flag this as the next-hardest unsolved problem once egress is
  covered. Genuinely hard; a roadmap signal, not a near-term promise.

---

## Who it's for (ICP)

**Regulated, code- and data-sensitive orgs — specifically where a leak can't be
blame-shifted away.** This qualifier matters: field research shows many orgs treat
a vendor contract as *liability transfer* — *"a breach isn't the end of the business
as long as you can blame a 3rd party."* For them a BAA is enough and Conduit is
overkill. Our buyer is the org for whom *"we had a contract"* is **not** an
acceptable post-breach answer:
- 50–500 engineers using AI coding assistants **and/or** shipping LLM-powered
  products (agents, RAG, copilots)
- Finance / fintech (esp. RBI data-localization-bound) / legaltech / healthcare PII / GCCs
- Spending (or about to spend) $20k+/month on LLM APIs across coding + production
- Has a security/compliance team that must approve where code **and customer data** go
- Runs in their own cloud account (AWS VPC / Azure tenant / GCP project)

We enter through the **coding-agent** door (urgent, code-sensitive, fastest to a
"yes" from security), then become the control plane for their production LLM
workloads too.

**Warm targets:** Groww, Razorpay, Zerodha (Indian fintech — RBI data-localization
makes them perimeter-bound by law), Gulf GCCs, SpotDraft (AI-native legaltech),
ThoughtSpot (publicly wrote about "FinOps for LLMs").

---

## Proof — what's built

Not a slide. A working, tested system:

- Transparent streaming proxy (SSE), virtual keys + AES-256-GCM encrypted creds
- Token/cost metering → ClickHouse (off the hot path), live dashboard
- **Per-key / per-model cost attribution** — the breakdown a shared key can't give
- **Exportable audit log** (CSV/JSON, metadata-only, gated) — the security-review artifact
- Budgets with live Redis enforcement, model allow-lists, per-key rate limits
- Exact-match cache, data-governance secrets scan with a **per-category alert→block
  feedback loop** (promote high-confidence categories one at a time; category-only)
- **Provider adapters: sit in front of AWS Bedrock (SigV4) or Azure OpenAI** — an org
  becomes a Bedrock/Azure shop with no client change
- Dashboard with auth, admin API, first-run setup wizard, Docker/compose, install doc
- **61 automated tests** (incl. AWS SigV4 verified against the published vector).
  < 5ms overhead, zero TTFT impact, metadata-only.

---

## The ask — design partner

**Run Conduit free in your own VPC for 60–90 days.**

- You get: full cost visibility, per-team budgets, credential security, and a
  **security-approvable path to AI coding agents** — with nothing leaving your
  perimeter.
- We get: your real traffic (inside your walls) and feedback, to shape the
  contextual data-governance layer for your specific sensitive data.

No data-plane SaaS. No code leaves your account. Cancel anytime.

---

## VC framing (one slide)

- **Market:** every regulated enterprise running LLMs — coding agents *and*
  production AI workloads — a segment currently *excluded* from the boom because it
  can't route code or customer data through SaaS. FinOps + governance for AI is a
  board-level line item.
- **Wedge:** governance, not cost. The one capability impossible both without a
  gateway and from a SaaS gateway.
- **Moat:** must run inside the customer's perimeter → no SaaS competitor can match
  it; the per-customer contextual-governance model compounds and raises switching
  costs.
- **Why now:** regulated exclusion + public cost pain + competitors validating
  on-prem demand.
- **Land & expand:** **Act 1** — coding agents (sharp wedge, security says yes
  fastest). **Act 2** — become the chokepoint for *all* the org's LLM traffic
  (production agents, RAG, copilots); contextual governance compounds per customer.
  TAM expands from "coding-assistant spend" to "all enterprise LLM spend under
  governance."
- **GTM:** design partners free now (India/GCC regulated fintech + GCCs); annual
  on-prem platform license per seat/vkey; managed SaaS for the long tail later.

---

*Conduit · on-prem AI FinOps & governance gateway · the control plane for every
LLM workload · land on coding agents, govern the whole org · built for regulated,
code- and data-sensitive enterprises.*
