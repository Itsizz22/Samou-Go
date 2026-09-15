# Mapbox migration audit — 2026-09-15

## Existing ownership and reuse

- Seven Vite themes; consolidated customer app includes staff captain flows. Shared UI map is `packages/ui/src/map`; customer checkout has a separate Leaflet picker.
- Existing Leaflet tracking/admin/pickup surfaces will use one shared Mapbox renderer. External Google Maps directions are navigation links and remain intentionally.
- Express tracking service uses `isOrderPartyMember`, platform GPS flag and captain location freshness. OSRM `road-routing.ts` validates geometry and returns the historical API tuple format `[lat,lng]`. Preserve the API format and convert once at the Mapbox GeoJSON boundary.
- Orders already snapshot `latitude`, `longitude`, `customerAddressText`, `addressNote`, and delivery zone. Saved address list currently lives per device in `address-book.ts`; it is not a database address entity. Audit account isolation and runtime validation before extending persistence.
- Stores already have nullable coordinates and public catalogue visibility/approval filtering. Reuse public catalogue for discovery; no hardcoded store data.
- Firebase native notifications and in-progress Web Push code remain. Native background GPS adapter, API timestamp validation, SSE authorization and concurrency test changes already exist locally from preceding task; they are not yet deployed.
- PWA uses existing service worker and Capacitor project; no second application.
- Existing deployment is GitHub → Render/Vercel. Public Mapbox token belongs in Vite env and build workflow, never TS source.
- Existing private Vercel backup workflow is deployed and enabled. Run 34998460198 verified 79 MB and 39-table isolated restore; retain seven. Do not rebuild.

## Acceptance gates

Mapping build/browser widths 320/360/375/390/430/tablet/desktop, OSRM failure, point ordering, stale GPS, saved-address/order immutability, visibility and ownership tests, then established deployment/smoke. Real accounts and Android/iPhone devices are requested separately; physical acceptance remains NOT VERIFIED until observed.

## Implementation and verification

- Reusable lazy BaseMap renderer now owns all maps. LeafletMap filenames are compatibility exports only; Leaflet runtime dependencies removed. OSRM and external navigation links unchanged.
- Mapbox 3.30.0 uses VITE_MAPBOX_ACCESS_TOKEN, configured as GitHub Actions repository variable and passed to all seven frontend builds. No token in source. RTL plugin and attribution retained; missing-token/WebGL fallback available.
- Route GeoJSON preserves all points and rejects malformed geometry; initial/stage route bounds include road geometry. Live GPS never continually refits the map. Captain marker interpolates and stale points fade.
- Saved addresses now partition by authenticated user. Legacy unscoped local data is deliberately not imported because its owner is unknown; users may need to resave old local addresses. No data deleted and no schema migration. This remains per-device storage, not cross-device synchronization.
- Order snapshot was already server-persisted; HTTP lifecycle regression proves changing profile location B does not change order A, and authorized captain receives A. Anonymous access rejects 401.
- Public real store coordinates feed markers and refresh every minute. Two stores currently provide valid coordinates; no coordinates manufactured for other stores. Card uses real accepting-orders state.
- Native samples validate ranges, freshness, accuracy; attempts bounded to ten seconds, identical successful samples coalesced to thirty-second heartbeat. Server caps authenticated captain updates to 20/minute per process. Multi-instance deployments require shared limiter storage.
- Map rendered in browser at 320, 360, 375, 390, 430, 768, 1280 widths: no horizontal overflow. Real store marker opened correct store card.
- Isolated browser picker: initial confirmation disabled; latitude 91 rejected; point 31.40123,35.07123 returned unchanged. Temporary harness removed. This was not a real GPS reading.
- Latest automated validation: API 478 passed (five opt-in PostgreSQL tests skipped in standard suite; separately passed on isolated PostgreSQL), domain 123 passed, API client 39 passed, map/native 9 passed. Seven frontend builds passed. No physical device validation.
- Controlled production login: authorized store succeeded; customer and captain supplied/assumed credentials returned 401. No production order created, no password reset attempted. Await corrected credentials/device participation.
- Existing private backup remains unchanged, with successful run 34998460198 and 39-table restore evidence.
- Remaining field gates: real checkout-to-delivery, actual OSRM movement route, GPS lock/background/reconnect, physical push receipt and iPhone PWA/native testing. External operational alert delivery remains unverified.
