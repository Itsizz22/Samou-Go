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

The homepage has a mobile-only fixed download bar; reserved bottom space and scroll padding keep the footer reachable. Support hours are not invented or advertised as 24/7.

The existing Vercel CSP, HTTPS/security headers and download throttling remain in place. There are no forms, tracking cookies, API connections or third-party runtime scripts. Social, WhatsApp and phone links are explicit. Public legal pages stay on this domain.

## Deployment

Git deployment uses the repository root and the configured project root above. For CLI staging, copy public files into a staging root containing `websites/samouquick/`, and deploy that root with the existing Vercel project IDs. Do not deploy this folder as if it were the repository root, and do not upload unrelated repository files or secrets.

## Verification

See `AUDIT.md` for the review and local validation scope. Production verification must cover apex/www, legal links, optimized assets, QR and the unchanged APK download.
