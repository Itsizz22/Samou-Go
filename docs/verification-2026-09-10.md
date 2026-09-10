# Verification — 2026-09-10

## Completed
- Featured dishes and promotional banners use cloned boundaries for seamless looping. Touch focus no longer permanently pauses autoplay. Horizontal drags suppress navigation, vertical scroll remains available, reduced-motion and pause controls are respected.
- Browser checks passed for automatic advance, last-to-first wrap, touch advance, autoplay after touch, pause and absence of React exceptions.
- Created 50 explicitly labelled demo dishes through the authenticated admin API in the E2E restaurant and sweets stores. Four illustrative category photographs are reused; these are not 50 unique food photos. Categories: pizza 15, burgers 15, salads 10, cake 10.
- Selected 12 demo dishes (3 per category) for the featured feed, which previously had no manual selection. Preserved existing category selections and appended the demo categories where applicable.
- Added synthetic shop coordinates inside As-Samou to the two E2E stores. No non-demo store coordinates were changed.
- Created order 260910-003, assigned the E2E captain, transmitted three synthetic positions, and verified customer tracking updates. Straight-line distances changed 605 → 451 → 237 metres. After ON_THE_WAY, destination changed from store to customer. Unauthenticated tracking returned 401.
- Cancelled the technical order after testing; restored the captain's previous store assignments. No actual delivery occurred.
- Customer browser with production catalogue: featured card opened the intended restaurant; no JavaScript exceptions in the tested flow.

## Road engine — production activation verified
The pinned OSRM 5.27.1 Linux bundle was prepared and tested on Ubuntu 22.04 in GitHub Actions. As-Samou road route: 875.9 metres, 160.3 seconds, 38 geometry points. Initial resident memory ~10.4 MiB; expanded bundle 32 MiB. This is a smoke measurement, not a concurrent-load capacity guarantee.

Release: https://github.com/Itsizz22/Samou-Go/releases/tag/routing-samou-20260910-v1
SHA256: `1c2cef9a0af3466d592c7133094cece500e5dec8906256b823374859308d15e9`

Production revision e680b67 is live on the existing Render 1 CPU / 2 GB instance. SAMOU_ROUTING_ENABLED=true enables hash-verified build preparation and supervised loopback OSRM plus API startup. No additional routing subscription or server was created. OSRM requires --max-viaroute-size greater than 2; the configured limit is 3. Four supervisor tests and eight road-routing tests passed.

Authenticated production order 260910-004 returned actual road geometry at three synthetic captain positions: 876 / 697 / 375 metres, with 38 / 30 / 14 points. Unauthenticated tracking returned 401. After ON_THE_WAY the destination switched to the customer and still returned a road route. Production Vercel browser checks passed for customer order tracking and captain dashboard map: fullscreen road geometry, path changed after GPS update, no JavaScript exceptions. Screenshots are stored locally in artifacts/routing-live-customer.png and artifacts/routing-live-captain.png. The technical order was cancelled and original captain store assignments restored.

Coverage is local bbox 34.98,31.30,35.16,31.48. OSM/Geofabrik road data must be verified against actual local access restrictions; travel time is estimated and excludes live traffic. Existing attribution must remain visible. Data outside this region has no guaranteed route.

## Release status and remaining work
- GitHub code updates pushed; CI passed for the routing proof and preceding code revision.
- Vercel rejected production deploy with `api-deployments-free-per-day` (>100), requesting retry after 24 hours. Do not bypass this quota. Web publication remains pending until deployments are allowed.
- Android release 1.0.9 (10) built and installed on emulator-5554. No physical phone was connected during this check.
- Remaining: publication of pending frontend changes when quota resets, real-device GPS/background verification, OTP provider configuration, and removal of all demo data before accepting real orders.
- This scoped verification is not a claim that every application feature or security scenario has been tested.
