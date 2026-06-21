# Conduit landing page

Single-file static site (`index.html`) — no build step, no dependencies.

## Before deploying — replace 1 placeholder

Search `index.html` for **`CONTACT_EMAIL`** (3 places) and replace with your
real email, e.g. `mailto:you@example.com?subject=Conduit%20design%20partner`.

Optional: swap the mailto CTAs for a Calendly/booking link.

The hero terminal auto-cycles through 4 live scenes (adopt → live request →
governance block → spend attribution). Tabs in the terminal header let visitors
jump to any scene; the cycle pauses once they interact.

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
