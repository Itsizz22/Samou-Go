# GPS reactivation — 2026-09-10

## Implemented
- Re-enabled shared GPS flag and default location capability.
- Shared Arabic tracking card across customer, captain, manager, and admin views; corrected initial map center to As-Samou.
- Authenticated order-party tracking endpoint with active-order captain position validation.
- Remaining straight-line distance to the store before pickup and customer after pickup, calculated server-side using Haversine.
- Stale positions (over 60 seconds) do not produce a distance. Missing destination coordinates are explained in the UI.
- Captain updates throttled to at least 10 seconds; permission/error/retry handling and watcher cleanup.
- Android coarse/fine permissions and iOS when-in-use usage description.

## Operational limits
- Location collection currently runs while the app is visible. Background/locked-phone tracking needs a separate native implementation and device validation.
- Distance is explicitly approximate straight-line distance, not road distance or an arrival-time estimate.
- Existing admin GPS setting remains authoritative. Deploy backend and frontend together before enabling on installed clients.
- OpenStreetMap tiles remain in use with attribution. Production capacity/provider suitability must be evaluated against the tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- No new release APK was installed, and these changes have not been committed or deployed.

## Verification
- Full workspace typecheck passed.
- Full build passed; customer build repeated successfully after map-marker asset fix.
- API tests: 321 passed; shared domain tests: 120 passed.
- Android debug assembly passed; merged manifest contains location permissions.
- 360px browser preview: no horizontal overflow, broken marker images, or page exceptions observed.
- Preview uses synthetic positions, not a live-device delivery test.
- Screenshot: ../artifacts/gps-preview-mobile.png
