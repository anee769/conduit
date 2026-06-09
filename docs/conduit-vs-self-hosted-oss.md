# Conduit vs. self-hosted open-source — when "just run LiteLLM" isn't enough

*A one-pager for the moment a prospect says "we'd just self-host an open-source
gateway." Honest, not a hit piece — open-source gateways (LiteLLM, Portkey OSS) are
genuinely good. The question is whether your **security and compliance** functions
can sign off on running one, unsupported, on your AI egress path.*

---

## The situation

Your engineers love open-source gateways — LiteLLM does virtual keys, budgets,
spend tracking, even PII masking, for free. That solves the **engineering**
problem.

But an AI gateway sits on your most sensitive path: every prompt, every line of
code, every secret your engineers send to a model flows through it. Before that
goes live in a regulated org, it passes **security review and vendor/procurement
review** — and that review asks six questions that **self-hosted, unsupported
open-source cannot answer**:

| The review asks… | Self-hosted OSS | Conduit |
|---|---|---|
| **Who's accountable when it breaks or leaks?** | You are. No SLA, no vendor, no contract. | A vendor + a support agreement. A throat to choke. |
| **Who patches CVEs, how fast?** *(LiteLLM had a SQL-injection CVE exploited in 36h and a supply-chain compromise.)* | Your team must watch advisories and patch the thing on your egress path. | Monitored dependencies + committed patch window for High/Critical CVEs. |
| **Can you prove the artifact's provenance?** | npm/pip pulls; no signature, no SBOM. | **Cosign-signed images + a CycloneDX SBOM** per release. |
| **Where are your compliance docs?** *(SOC2 / pen-test / data-flow / SIG-CAIQ / DPA)* | None — it's a GitHub repo. | Security whitepaper + data-flow + completed CAIQ-lite today; SOC 2 on the roadmap; we support your audit. |
| **Who indemnifies us?** | OSS licenses disclaim **all** warranty ("AS IS"). | A real contract term. |
| **Will it be maintained in 3 years?** | Maybe. | A commercial relationship and roadmap. |

This is why **Red Hat, GitLab, Elastic, and Confluent** all exist: the code is
free, but regulated buyers pay for **support + compliance + liability + hardening**
— so they're not the maintainer of critical infrastructure.

## Why Conduit specifically (not just "a supported gateway")

Support alone isn't the whole pitch — here's the *why-us*:

- **On-prem-first, never SaaS.** Runs entirely in your cloud, no phone-home,
  air-gappable. (Several "enterprise" gateways are SaaS-first and only offer
  on-prem as an add-on — your traffic still transits their cloud by default.)
- **Built for the regulated India / GCC mid-market** — the buyer US-centric tools
  don't hold through an RBI / DPDP / sectoral review.
- **Coding-agent specialized** — purpose-built for Claude Code / Cursor / Codex
  egress, not a generic app-traffic gateway.
- **Governance that ships, in-perimeter** — secrets/PII caught before they leave,
  per-category promote-to-block, category-only recording (never the value), and an
  auditor-ready export — under one control plane with budgets, allow-lists, and
  per-engineer attribution.
- **Security-first engineering** — fail-closed auth, metadata-only (no prompt
  storage), lean hot-path dependency surface, 61 automated tests, signed releases.

## When you should *not* buy Conduit (honesty)

If you have a platform/security team with the bandwidth to **harden, monitor,
patch, and document** an open-source gateway yourselves — and your compliance
function will accept that — then self-host the OSS. That's a legitimate choice, and
it's how the large, well-staffed shops (the unicorns) do it.

Conduit is for the orgs where that's **not** true: regulated, code-sensitive, and
without a spare platform team to own critical infrastructure — who need the egress
control **and** the supported, compliance-ready package to get security to "yes."

## The one question that decides it

> *"Would your security team sign off on self-hosted, unsupported open-source on
> your AI egress path — or do you need a supported vendor with patch SLAs, signed
> artifacts, and compliance docs?"*

If the answer is the latter, that's exactly what Conduit is.

---

*Want the security whitepaper, data-flow diagram, or a completed CAIQ-lite? They're
ready — ask. Free 90-day design-partner pilot, in your own VPC.*
