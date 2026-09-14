# Samou Quick public website

Static, Arabic RTL download landing page at https://samouquick.com. This directory is independent of the mobile app, API, database and staff dashboards. Vercel project: `samou-go/samouquick-download`; project root directory: `websites/samouquick`; no install/build command; output `.`.

## Content and maintenance

- `index.html`: coverage, hero, category discovery, benefits, five ordering steps, genuine UI screenshots (clearly labeled demo catalogue), existing supplied banners, Android download and footer.
- `content/categories.json`: category names/descriptions and optional verified store names. `stores` is deliberately empty: do not invent partners or publish test businesses as real stores. Add only approved public store names as `{ "name": "..." }`.
- Run `node websites/samouquick/scripts/render-categories.mjs` from the repo root after updating categories, then format the HTML. This produces static accessible disclosure cards; visitors make no API requests.
- `privacy.html`, `terms.html`, `delete-account.html`: existing policy content, clearer navigation and page-specific metadata. Update policy text only after checking the applicable product behavior and approved wording.
- `assets/app-home.webp` and `app-products.webp`: actual UI captures. Product screenshot uses demo data, disclosed next to the images. Replace with approved genuine merchant screenshots when available.
- `assets/download-qr.svg`: standard QR for `https://samouquick.com/#download`. Keeps working when the APK changes. Desktop users scan it; mobile users get a direct download CTA.
- Fonts are self-hosted Tajawal WOFF2, converted from the existing licensed TTF files. License: `assets/Tajawal-OFL.txt`.

## Android download

Existing artifact: version **1.0.32**, build **33**, package `com.samougo.customer`, approximately **13 MB**. Website-only edits do not rebuild or modify it. Replace the APK, version labels and filename together for future releases. iPhone is explicitly marked unavailable; no fake store badges or download links.

## Interaction and security

Native category disclosure controls and screenshot scrolling work without JavaScript. Repeated carousel content has been consolidated into the screenshots/ordering journey and a compact forthcoming-parcels card. A native FAQ answers coverage, tracking, contact and iPhone questions. Reduced motion is respected; content is never hidden pending JavaScript. `style.css` retains the original design; `refinements.css` contains the focused landing-page improvements.

The homepage has a mobile-only fixed download bar; reserved bottom space and scroll padding keep the footer reachable. Support hours confirmed by the owner: 10 AM to midnight.

The existing Vercel CSP, HTTPS/security headers and download throttling remain in place. There are no forms, tracking cookies, API connections or third-party runtime scripts. Social, WhatsApp and phone links are explicit. Public legal pages stay on this domain.

## Deployment

Git deployment uses the repository root and the configured project root above. For CLI staging, copy public files into a staging root containing `websites/samouquick/`, and deploy that root with the existing Vercel project IDs. Do not deploy this folder as if it were the repository root, and do not upload unrelated repository files or secrets.

## Verification

See `AUDIT.md` for the review and local validation scope. Production verification must cover apex/www, legal links, optimized assets, QR and the unchanged APK download.

## Launch countdown (current public state)
The public download box is temporarily a coming-soon countdown. Launch instant: `2026-09-26T13:13:17Z`, fixed at fourteen days from the owner's request. All public APK CTA links now go to `/#download`; the existing APK artifact remains unchanged. The timer derives remaining time from the absolute timestamp on every tick, clamps at zero, and does not automatically publish a release. To change the date, edit `data-launch-at` and the visible date together in index.html. Countdown rendering has no external dependencies or backend calls.


## Cinematic redesign — 13 September 2026 (published)
The homepage now uses `cinematic.css`; the older stylesheets remain for the unchanged legal pages. The existing category renderer and category source remain compatible. Header, phone story, FAQ, footer, QR, and absolute launch countdown are retained/refined.

`assets/hero-story.webm` is an eight-second, silent VP9 motion composition of the existing `hero.webp` asset (921,644 bytes), not new live delivery footage. The same image is the poster. Browsers without video support, reduced-motion users, and connections indicating data saving/2G/3G get the poster. A labeled pause/resume control is available; hidden/offscreen video pauses. Only this video is loaded. No new external tracking/animation libraries are used. CSP permits same-origin media only; other security restrictions remain.

The current brief requests Android download functionality: the existing APK is linked again without changing/rebuilding the binary. Its exact size is 13,592,625 bytes. The official launch countdown still targets 26 September 2026 and does not automatically change availability. iPhone remains coming soon. No app-store badges or fabricated merchant/tracking data were added. The phone images remain the two genuine, clearly disclosed demo captures.

Local QA passed at widths 320, 360, 375, 390, 430, 768, 1366, 1440 and 1920. Checked overflow, header transition, FAQ, countdown, APK HEAD, legal routes, console/network errors, video play/pause/offscreen behavior, reduced motion/save-data zero video requests, and no-JavaScript content/FAQ/download. Screenshots and check results are under ignored `artifacts/site-*` and `artifacts/cinematic-*`. Production TLS warning on other devices remains unconfirmed pending the user's warning screenshot; this redesign does not claim to fix it.

Website-only production deployment: `dpl_4SonMgx7aanv1np3fRC4Eeq5bFSt`, deployed from an isolated public-files staging directory. Verified apex HTTPS 200, www HTTP 308 to HTTPS, and browser QA on production at 320/390/1440px: legal pages, FAQ, media policy, download HEAD, countdown and no console errors. Application code, API/schema changes and APK binary were not deployed or rebuilt.

## Current release gate — 13 September 2026 correction
Public downloads are CLOSED until the owner explicitly authorizes launch. All CTAs lead to the fixed countdown. No APK file is included in the deployed staging directory, and `/downloads/:path*` redirects temporarily to `/#download`. Do not include the local downloads directory in staging. The mistaken deployment `dpl_4SonMgx7aanv1np3fRC4Eeq5bFSt` was deleted. Correct production deployment: `dpl_5ceJZdoVCrdtNpVxz4S64v1VAtVt`. Apex and www verified: countdown present, no APK link, old APK URL returns 307. At the owner's request, the FAQ states iPhone will be available at launch; this is launch copy, not verification of an iOS release.
