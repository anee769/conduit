# Conduit landing page

Single-file static site (`index.html`) — no build step, no dependencies.

## Before deploying — replace 2 placeholders

Search `index.html` for:

1. **`CONTACT_EMAIL`** (3 places) — your real email, e.g.
   `mailto:you@example.com?subject=Conduit%20design%20partner`
2. **`LOOM_URL`** (2 places) — the demo video link.

Optional: swap the mailto CTAs for a Calendly/booking link.

## Deploy (~2 minutes, all free)

| Host | How |
|---|---|
| **Vercel** | `npx vercel site/` — or drag the `site/` folder into vercel.com/new |
| **Cloudflare Pages** | Dashboard → Pages → *Upload assets* → drop the `site/` folder |
| **Netlify** | app.netlify.com/drop → drop the `site/` folder |

Then point a domain at it (all three hosts walk you through DNS), or use the
free `*.vercel.app` / `*.pages.dev` URL in outreach.

## Preview locally

```bash
python3 -m http.server 8901 --bind 127.0.0.1 --directory site
# → http://127.0.0.1:8901
```
