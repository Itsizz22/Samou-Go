# Public landing page
This is the existing static website, independent of the ordering service.

## Build and checks
- Run `node websites/samouquick/scripts/build.cjs`.
- Run `node --test websites/samouquick/tests/*.test.cjs`.
- Deployment staging and the publishing workflow run these build checks.

## Launch information
Edit `content/launch.json` then run the build and deploy. Set `prelaunch` to false to remove the notice after confirming the service is available. This configuration never opens or closes ordering in the backend.

## Visual verification
Verified in headless Edge at 320, 390, 768 and 1440 px: no horizontal overflow, images load, filter order and section position stay stable, mobile menu closes with Escape, reduced motion cancels animations, and content/downloads remain usable without JavaScript. Physical iPhone/Safari verification remains necessary.

The third journey screenshot is the actual home screen showing the Orders tab; it is not presented as a captured active tracking screen.

## Update public catalogue

With repository dependencies installed (Sharp is already available):

```powershell
node websites/samouquick/scripts/sync-catalogue.cjs
node --test websites/samouquick/tests/catalogue.test.cjs
node --check websites/samouquick/site.js
```

The sync reads public data, selects a small category-diverse sample, optimizes approved store logos, and updates the static HTML/snapshot. It fails without overwriting the snapshot if the catalogue is unavailable. Live updates use cached local logos only when the upstream logo URL is unchanged.

## Deployment

Existing Vercel project: `samou-go/samouquick-download`, root directory `websites/samouquick`, framework Other, output `.`, no application build/install command. Keep that project root. Prepare a fresh isolated staging directory so unrelated repository files and secrets are never uploaded; only the APK explicitly linked from the public page is included:

```powershell
node websites/samouquick/scripts/stage-release.cjs artifacts/marketing-release-next
npx vercel --prod --yes --cwd artifacts/marketing-release-next --scope samou-go
```

The staging script requires the existing ignored `.vercel/project.json`. It never deletes/replaces a non-empty staging directory.

Keep `vercel.json` CSP and JSON-LD hash synchronized if editing the Organization data. `tests/catalogue.test.cjs` validates the hash. Mapbox is the only permitted remote script/style host. Existing HTTPS/frame/private-permission protections remain.

