# Samou private road routing

Prepared deployment package, not a running production service. Docker is unavailable on the current Windows workstation; image build/smoke test has NOT been executed here. Base image tag/digest existence and smoke-script syntax were checked. The manual GitHub Actions workflow can build and run the real service before deployment.

## Design
- OSRM driving profile, MLD, pinned official v5.27.1 image digest.
- Geofabrik regional source clipped to 34.8,31.15,35.4,31.8 (Samou, Hebron and surrounding area). Routes outside this coverage are not supported; enlarge deliberately if the delivery area expands.
- Dataset processed at image build time. Restarts reuse it; no customer data or database is required.
- Source checksum and revision retained inside /data. Bump MAP_REVISION and rebuild to refresh OSM data. The latest source URL is mutable, so source hashes are recorded rather than claiming reproducible map inputs.
- Non-root read-only runtime, 2GB local memory limit as an initial test budget; actual production memory must be measured.
- Local binding is loopback only. Render service is PRIVATE, never expose unauthenticated OSRM directly on a public address.
- Keep OpenStreetMap attribution in the client. Check road coverage/access restrictions locally; no live traffic or vehicle navigation guarantees.

## Local build and check (Docker required)
From the repository root:

    docker compose -f ops/osrm/compose.yaml up --build -d
    node ops/osrm/smoke.mjs

The application API can then use OSRM_BASE_URL=http://127.0.0.1:5000. If the API is itself a container, connect it to the same Docker network and use http://routing:5000 instead.

## Render preparation
1. Review ops/osrm/render.yaml. It proposes a PAID 1 CPU / 2GB private instance; no subscription has been created. Confirm current price before provisioning.
2. Set region to match the existing API (the file's frankfurt value is a deployment default, NOT a verified current API region).
3. Apply this separate Blueprint only after cost approval. Build context is ops/osrm, so app secrets cannot enter the routing image.
4. Confirm the service is healthy. Copy its actual Render internal hostname; do not invent it from its display name.
5. Set OSRM_BASE_URL=http://ACTUAL_INTERNAL_HOST:5000 on the API and redeploy the API code containing the routing integration. Both services must support private networking in the same region/workspace.
6. Run the smoke request from the API/private network, then test an order with real saved store/customer coordinates. Upgrade the web/APK to the route-capable client.

## Rollback
Remove OSRM_BASE_URL and redeploy the API to restore labelled straight-line fallback. Suspend/delete only the dedicated routing service if no longer needed. No order database migration is involved.

Sources:
- https://github.com/Project-OSRM/osrm-backend/blob/v5.27.1/docker/Dockerfile
- https://download.geofabrik.de/asia/israel-and-palestine.html
- https://render.com/docs/blueprint-spec
