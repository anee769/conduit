# Conduit — outreach drafts

Copy/paste-ready. Swap the `{{tokens}}` before sending. Never send from Equiti
infra or accounts — personal LinkedIn, personal email, personal GitHub only.

**From:** Aneesh Gupta · `aneeshgupta709@gmail.com`
**Site URL token:** `{{CONDUIT_SITE_URL}}` — replace once you deploy
`site/` to Cloudflare Pages / Vercel / Netlify.

---

## Sequencing (do this, in this order)

1. Deploy `site/` to Cloudflare Pages / Vercel / Netlify — contact email is already wired.
2. **Tonight** — send the 5 Reddit DMs (Draft A). 15 min total. Highest-conversion sends in the list.
3. **Tomorrow** — send 9–12 LinkedIn connection requests (Draft B).
4. **24h after each accept** — followup DM (Draft C).
5. **Week 2** — anyone who didn't accept on LinkedIn → cold email (Draft D).

Target: 3–5 serious replies from ~17 sends. Land 1–2 pilots.

---

## Target list

### Tier 1 — Reddit DMs (warmest — they self-identified the pain)

| # | Handle         | Why                                                                        |
|---|----------------|----------------------------------------------------------------------------|
| 1 | `lifelong1250` | Shared-IAM-role on SageMaker — exact "no per-engineer attribution" wedge   |
| 2 | `Mr_Cromer`    | InfoSec at regulated org, asking about local models — egress governance    |
| 3 | `Gesha24`      | "No metric for AI productivity" — attribution buyer                        |
| 4 | `Any_Pop_1359` | Built/uses substitution; will validate roadmap even if not a buyer         |
| 5 | `DurthVadr`    | SHIM founder — competitor; positioning intel + maybe partnership on in-perimeter |

### Tier 2 — Indian regulated fintech / NBFCs

Find via LinkedIn search before sending:

| Org                  | Search for                                                |
|----------------------|-----------------------------------------------------------|
| Moneyboxx Finance    | `"CTO" Moneyboxx`                                         |
| Shriram Finance      | `"CISO" OR "Head of InfoSec" Shriram`                     |
| CRED                 | `"CISO" OR "Head of Security" CRED`                       |
| HDFC Bank            | `"VP InfoSec" OR "Head of Application Security" HDFC`     |

### Tier 3 — GCCs in India (finance / healthcare / regulated)

Use the **find-then-send recipe** below — never guess names.

**Finance:** Wells Fargo · JPMorgan Chase · Goldman Sachs · Morgan Stanley · Citi · HSBC · Deutsche Bank · BNY Mellon · State Street · Standard Chartered · Barclays · UBS · Fidelity · American Express

**Healthcare / pharma:** Cohere Health · Carelon (Elevance) · Optum · CVS Aetna · Cigna/Evernorth · Novartis · Sanofi · Roche · AstraZeneca · Eli Lilly · MSD

**Other regulated:** Allianz · AXA · MetLife · Prudential · Lloyds · Vodafone/_VOIS · Shell · BP · SLB

---

## LinkedIn find-then-send recipe

Paste these into LinkedIn search **in order**, stop when you get a real hit.
The buyer is whichever role comes back first with 200+ eng under them and an
Indian location (Bangalore / Hyderabad / Chennai / Pune / Mumbai / Gurgaon).

1. `"Head of Engineering" {{Org India / GCC / GIC / IDC}}`
2. `"VP Engineering" OR "VP Platform" {{Org India}}`
3. `"Director" ("Developer Experience" OR "DevEx" OR "Engineering Productivity") {{Org India}}`
4. `"Head of" ("Information Security" OR "InfoSec" OR "CISO") {{Org India}}`
5. `"AI Platform" OR "ML Platform" {{Org India}}`

Verify the person on LinkedIn before sending: 5+ years at the org, headline
mentions platform/DevEx/security/AI, recent post about AI tooling is a green
light.

---

## Draft A — Reddit DM (Tier 1)

Short. References their actual comment. Sent tonight.

> **Subject:** the attribution thing you mentioned
>
> Hey — saw your comment about {{their specific pain: "shared IAM role on SageMaker" / "no per-AI-engineer metric" / "infosec doesn't want local models"}}.
>
> I've been building exactly the missing piece: an on-prem gateway that sits between Claude Code / Cursor and Anthropic / OpenAI / Bedrock, gives you per-engineer attribution, hard budgets, and egress governance — runs entirely in your own VPC, never sees your code.
>
> Free 90-day pilot for the first 1–2 design partners. Worth a 15-min look? I can send a 1-pager + the security whitepaper before any call.
>
> — Aneesh
> {{CONDUIT_SITE_URL}}

---

## Draft B — LinkedIn connection request (Tier 2/3)

≤200 chars. Goal is the accept, not the pitch.

> Hi {{First}} — building an on-prem AI gateway for regulated eng teams (per-engineer attribution + egress governance, runs in your VPC). Free 90-day pilot for 1–2 design partners. Would love to share a 1-pager.

---

## Draft C — LinkedIn followup DM (within 24h of accept)

This is the actual pitch. Send right after they accept.

> Thanks for connecting, {{First}}.
>
> Quick context — most regulated eng orgs I've talked to are stuck in the same place on AI coding agents: legal can sign off on Bedrock + a no-train BAA (the *channel to the vendor* is solved), but the *internal* side is still empty — no per-engineer cost attribution, no budget caps, no record of what left the perimeter. So either you ban it (engineers go shadow on personal accounts) or approve it and hope.
>
> Conduit is the internal half. It sits between Claude Code / Cursor / Codex and whatever provider you already use (Anthropic, OpenAI, Bedrock, Azure), entirely inside your own cloud. It gives:
>
> - finance per-engineer / per-model spend (the breakdown a shared API key can't produce),
> - security an egress governance layer (secrets + a per-org entity allowlist for your customer names / codenames / deal codes; alert → promote-to-block one category at a time, never stores the matched value),
> - a context-rot panel that shows where your team is paying a cost-and-error premium on oversized prompts (measure-only — we never modify the prompt),
> - auditors a CSV/JSON export.
>
> Sub-5ms overhead, no client changes, prompts / completions never stored. Signed images, CycloneDX SBOM, security whitepaper ready.
>
> I'm looking for 1–2 design partners for a free 90-day pilot. You'd run it in your VPC, get the full product + direct access to me, no data leaves your account. In return I get feedback shaping where it goes next.
>
> Worth a 20-min look? Happy to send the security whitepaper + landing page first.
>
> — Aneesh
> {{CONDUIT_SITE_URL}}

---

## Draft D — Cold email (fallback only)

Use only when LinkedIn connection request isn't accepted within ~7 days.

> **Subject:** governance for AI coding agents at {{Org}} — design partner ask
>
> Hi {{First}},
>
> I'm Aneesh — built Conduit, an on-prem gateway that sits between AI coding agents (Claude Code, Cursor, Codex) and the providers your team already uses (Anthropic, OpenAI, Bedrock, Azure). It gives:
>
> - per-engineer cost attribution (the breakdown a shared API key can't produce),
> - hard budgets + model allow-lists,
> - egress governance: secrets + per-org entity allowlist (customer names, codenames, deal codes); alert → promote-to-block, never stores the matched value,
> - a context-rot panel that surfaces where you're paying for oversized prompts (measure-only),
> - auditor-ready CSV/JSON export.
>
> Runs entirely in your VPC. Prompts and completions are never stored. Sub-5ms overhead. Cosign-signed images + CycloneDX SBOM + security whitepaper ready.
>
> I'm looking for 1–2 design partners — free 90-day pilot, your cloud, cancel anytime. {{Org}} looks like a fit ({{one specific reason: GCC code sensitivity / RBI localization / regulated egress posture}}).
>
> Worth a 20-min call? Reply yes and I'll send the whitepaper + landing page.
>
> — Aneesh
> {{CONDUIT_SITE_URL}}

---

## Draft E — Reddit reply to AI-policy thread (organic, not DM)

When you spot a thread on r/devops, r/cscareerquestions, r/india, or any
regulated-industry sub where someone is asking about AI tooling policy /
governance / attribution / banned-but-engineers-still-use-it.

> We built exactly this — on-prem gateway that sits between Claude Code / Cursor / Codex and Anthropic / OpenAI / Bedrock, gives per-engineer attribution, hard budgets, egress governance. Runs in your own VPC, prompts never stored.
>
> Free 90-day pilot for the first 1–2 design partners. {{CONDUIT_SITE_URL}} — happy to DM details.

Use sparingly. One organic comment per sub per week, max — Reddit's anti-spam
heuristics will throttle you (or worse, ban the account) if you post the same
link more than that.

---

## Tracking sheet (start simple, 1 row per send)

| Date | Channel | Name | Org | Tier | Status | Followup date | Notes |
|------|---------|------|-----|------|--------|---------------|-------|

Statuses: `sent · accepted · replied · call booked · pilot started · no-reply · declined`

If you hit 14 sends with 0 replies in 7 days, **stop** and re-examine the
pitch — don't keep sending the same message. The drafts above are starting
points, not gospel. Iterate based on what the first 3–5 responders push back on.
