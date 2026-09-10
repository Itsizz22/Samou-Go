# Physical Android GPS check — 2026-09-10

Samsung device running signed 1.0.3 (4). Production GPS flag enabled, Android location permission and device location service enabled.

Verified with existing E2E captain and reserved E2E order:
- Real device location reached production API, fresh timestamp, no geolocation simulation.
- Order owner could read the position. Another test customer received 403; anonymous requests received 401.
- Hiding the app stopped timestamp updates. After 72 seconds snapshot was stale; no distance was advertised.
- Reserved-order map selection incorrectly depended on ON_THE_WAY orders. Fixed both captain frontends to choose an assigned reservation when no delivery is underway, including map rendering guard.
- Release web build, standalone captain typecheck, and signed Android build passed.

Missing data: tested store has no saved coordinates. Distance to that store cannot be verified until its actual location is entered. No coordinates were invented.
New production test order 260910-001 was cancelled after store-assignment mismatch was correctly rejected. A second creation at the assigned closed store was correctly rejected (no order created). Existing E2E order status was left unchanged.

Scope limits: foreground tracking only; no road routing/ETA, background service, moving vehicle test, or blanket app-wide bug-free claim.
