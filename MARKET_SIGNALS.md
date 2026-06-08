# Market Signals — Field Research

Primary-source notes from practitioners describing how regulated / code-sensitive
orgs actually handle AI coding agents. Treat as **evidence**, not opinion — these
are the buyers (and adjacent vendors) speaking unprompted. Updated as new signal
arrives.

---

## Source: Reddit thread — "how are regulated orgs letting engineers use AI coding agents" (2026-06)

~21 practitioners replied. Roles spanned: someone who sells AI to regulated
industries, a DoD contractor, fintech security engineers, a startup building
SSE/DLP for LLMs, and ICs at orgs that have banned or partially-approved AI.

### S1 — The perimeter problem is now treated as SOLVED (consensus)

The dominant answer, repeated independently by 7+ people:
**Bedrock / Vertex / Azure OpenAI private endpoint + a no-train contract or BAA.**

> "Bedrock + Claude or Azure OpenAI with a private endpoint is where most fintech
> teams I know landed. Code never leaves your VPC, no public API call, and you can
> get a BAA without a six-month fight." — Zealousideal-Ebb-355

> "The best you can do is get a master service agreement with Anthropic where they
> won't train on your code. If you want to use Claude, you send tokens to
> Anthropic. End of discussion." — lotekjunky

> "BAA + TPRM. TLDR: the vendor promises to keep your data secure and isolated."
> — AuroraFireflash

Also: neuronexmachina, lifelong1250 (SageMaker subnet proxy + Bedrock), TomOwens
(GitLab Duo + Copilot, no-train contract).

**Strategic implication:** STOP leading with "data never leaves your perimeter."
The market believes data-egress-to-vendor is handled by cloud-hosted models +
contracts. That claim is now contested table-stakes, not a differentiator. Conduit
must **sit in front of Bedrock/Azure** (adapter already on roadmap) and lead with
the half nobody has solved → the internal control plane.

### S2 — The INTERNAL control plane is universally UNSOLVED (the wedge, confirmed)

Every practitioner who got specific revealed the same gap. Bedrock+BAA secures the
channel to the vendor; it gives you nothing on attribution, budgets, secret-egress,
or audit of what your own people/agents sent.

> "Each SageMaker space uses the same IAM role, so we can't break down billing by
> user. That's a good point and something for us to think about. Right now Bedrock
> is a huge force multiplier so management isn't concerned about cost yet."
> — lifelong1250  ← "yet" is the whole pitch

> "Even when access is approved and routed through private endpoints, there's
> basically no audit trail of what the agent touched or decided. You know data
> left, but not why, or what reasoning chain produced the change." — Jony_Dony

> "We honestly don't know if AI is worth it" (no defensible productivity metric)
> — Gesha24

The error/debug-log leak path (PabloZissou) was raised and then dismissed by a
salesperson as "irrelevant, that's a risk without AI" — i.e. unsolved and unowned.

**Strategic implication:** This is the defensible territory. Attribution, per-team
budgets, secret/PII egress detection, and audit are exactly what Bedrock +
contracts do NOT provide. Lead here.

### S3 — Contracts are liability-transfer, not leak-prevention (GTM headwind)

The most important comment in the thread, because it cuts against the wedge:

> "If what the contract says is OK to pass the buck from the legal team's
> perspective, then it's all good. Reality is that for most companies the security
> breach is not the end of business, or even a huge reputational cost, as long as
> they can blame some 3rd party for it." — Gesha24

Supporting: Xibbas is openly skeptical that "local redaction before cloud"
actually happens ("I question if it's actually happening locally, but some vendors
state it does and have signed contracts"). AuroraFireflash: "vendor promises."

**Strategic implication:** Many orgs want to *transfer* liability, not *prevent*
leaks — for them a contract is sufficient and Conduit is overkill. NARROW the ICP
to orgs where a leak genuinely cannot be blame-shifted away: RBI-data-localization
fintech, healthcare PII, defense/IP-critical. The buyer is the org for whom "we
had a contract" is not an acceptable post-breach answer.

### S4 — Blanket bans backfire into shadow AI (consensus → strong hook)

> "Blanket bans usually just push engineers to use personal accounts on company
> code, which is way worse." — Username_apk

> "Blanket ban just means engineers use it on personal laptops with prod code
> copy-pasted in." — Zealousideal-Ebb-355

Royal-Honeydew-6312: banned everything except Copilot Chat. Real, common, and the
exact condition that creates shadow usage.

**Strategic implication:** The framing is **governed AI vs. shadow AI**, not AI vs.
no-AI. A ban doesn't remove the risk, it makes it invisible. This is the cleanest
one-line hook the thread produced.

### S5 — Self-hosted models: real but costly; quality gap narrowing, still real

> "A strong 70B coding-centered self-hosted Gemma or Qwen can outperform GPT-4.0"
> — Vast_Ad_7929 (but conceded only vs *older* GPT-4; gap to Opus/Codex stands)

neuronexmachina, Namelock: setup/maintenance overhead + GPU scarcity are real;
local models underperform hosted.

**Strategic implication:** Validates the architecture decision — Conduit proxies to
frontier models, does NOT self-host inference. We are the control layer for orgs
that (correctly) keep using Claude/GPT, not a self-hosting play. Correct the common
conflation: "on-prem gateway" ≠ "on-prem GPU inference."

### S6 — "Governance built-in beats bolted-on → faster compliance signoff"

> "Our compliance team actually signed off faster than expected because the
> governance story was already built in instead of bolted on after the fact."
> — TangeloWhite908 (running Kestra on-prem, air-gapped, RBAC+SSO+audit)

**Strategic implication:** Best untapped sales narrative. The currency isn't
features — it's **time-to-yes from security/compliance.** Position Conduit as the
artifact that makes the security review short: virtual keys, egress scan, audit,
metadata-only, runs in their VPC — all the questions answered before they're asked.

### S7 — Agent-action audit = Phase-3 frontier (Jony_Dony)

"No audit trail of what the agent touched or decided / what reasoning chain
produced the change." Beyond T1 egress scanning. Genuinely hard. Capture as a
roadmap signal; do NOT overpromise it as built.

---

## Net repositioning (carried into PITCH.md)

1. **Perimeter → control plane.** Concede Bedrock/BAA solves vendor-trust;
   differentiate on the internal control plane it leaves empty.
2. **Complement Bedrock/Azure, don't replace.** "Already on Bedrock? Put Conduit in
   front of it for the attribution, budgets, and egress you still don't have."
3. **Two validated hooks:** governed-AI-vs-shadow-AI; built-in-governance =
   faster-compliance-signoff.
4. **Narrow ICP** to leak-is-catastrophic orgs (liability transfer is not enough).
5. **Roadmap frontier:** agent-action audit (what the agent touched/decided).
