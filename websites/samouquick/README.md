# Samou Quick public website

Public Arabic RTL marketing site: https://www.samouquick.com. This is a standalone HTML/CSS/vanilla JS site; application logic remains in the monorepo workspaces.

## Current state — 24 September 2026

- Public downloads remain **closed by owner instruction**. `/downloads/:path*` redirects to `/#download`. No APK is included in deployment staging. Opening downloads requires an explicit release decision; the displayed launch date does not open them automatically.
- Android and iPhone both display only “قريبًا” (coming soon). Public downloads remain closed.
- `index.html` + `marketing.css` + `site.js` provide the homepage. Existing legal styles remain for legal pages.
- A small representative store sample is derived from the anonymous public catalogue. No total store/coordinate counts, ratings or invented metrics are published.
- `api/public-stores.js` is a website-only read adapter. It calls a fixed public GET endpoint without authentication. Projection permits only public store data; internal app destinations are excluded. Cards are non-navigating articles. It accepts GET/HEAD, rejects mutations, has an 8-second shared timeout, and uses CDN caching (5 minutes + 10-minute stale window).
- `content/stores.json` and generated HTML provide a genuine snapshot for crawlers/no-JS/failure. Runtime failures explicitly label it as a saved sample. Open/closed badges are omitted because cached data is not a reliable live opening-hours guarantee.
- The public map was removed by owner request. No Mapbox scripts, map configuration or map credentials are shipped. Existing application maps are unaffected.
- Real UI screenshots come from `outputs/public-showcase-2026-09-23`, captured from the application web UI. Website files are compressed WebP. The tracking illustration uses the existing product timeline concept and is labelled illustrative; it contains no order, route, ETA or personal data.
- No advertising analytics or new tracking SDK is installed. Therefore there are no fictitious conversion-event integrations to claim.

## Update public catalogue

With repository dependencies installed (Sharp is already available):

```powershell
node websites/samouquick/scripts/sync-catalogue.cjs
node --test websites/samouquick/tests/catalogue.test.cjs
node --check websites/samouquick/site.js
```

The sync reads public data, selects a small category-diverse sample, optimizes approved store logos, and updates the static HTML/snapshot. It fails without overwriting the snapshot if the catalogue is unavailable. Live updates use cached local logos only when the upstream logo URL is unchanged.

## Deployment

Existing Vercel project: `samou-go/samouquick-download`, root directory `websites/samouquick`, framework Other, output `.`, no application build/install command. Keep that project root. Prepare a fresh isolated staging directory so unrelated repository files, APKs and secrets are never uploaded:

```powershell
node websites/samouquick/scripts/stage-release.cjs artifacts/marketing-release-next
npx vercel --prod --yes --cwd artifacts/marketing-release-next --scope samou-go
```

The staging script requires the existing ignored `.vercel/project.json`. It never deletes/replaces a non-empty staging directory.

Keep `vercel.json` CSP and JSON-LD hash synchronized if editing the Organization data. `tests/catalogue.test.cjs` validates the hash. Mapbox is the only permitted remote script/style host. Existing HTTPS/frame/private-permission protections remain.

## QA and report

See `REPORT-2026-09-24.md` for the complete before/after report, deployment ID, verification and remaining limits. Browser QA evidence and screenshots are in ignored `artifacts/marketing-qa/`.

## Final polish and owner clarifications

- Keep every screenshot and category visible without horizontal swiping. Mobile screenshots stack vertically.
- Keep launch/download closed and show “قريبًا” for both platforms.
- Do not expose or link internal deployment domains in HTML, JS or catalogue responses.
- Use small one-time scroll reveals with IntersectionObserver; respect reduced motion and keyboard focus. No continuous motion.
- See `POLISH-REPORT-2026-09-24.md` for verification and final deployment.
