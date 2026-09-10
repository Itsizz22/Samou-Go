# Road routing integration

Configure OSRM_BASE_URL on the API with an operator-managed, OSRM-compatible driving service. No public demo endpoint is enabled by default. Existing GPS and saved destination coordinates are required.

The API requests GeoJSON road geometry, distance in metres, and duration in seconds. It changes destination from store to customer when the order becomes ON_THE_WAY. Requests time out after 2.5 seconds, coalesce for matching endpoints, and cache for 20 seconds (maximum 500 entries). Coordinates are only sent to the configured service. Responses with malformed geometry or waypoints snapped more than 150m away are rejected.

The shared map renders a brand-colour road polyline in compact and fullscreen modes. Route geometry participates in map bounds. Old/missing locations hide the route. Failed/unconfigured routing retains explicitly labelled straight-line distance without inventing a line or ETA. Duration is a driving estimate, not live traffic or preparation time.

Validation: 38 routing/lifecycle tests passed. One public-demo request using synthetic As-Samou endpoints returned 875.9m / 160.3s / 38 geometry points; browser preview rendered the road polyline with the semantic brand colour. Public demo was used only for this development check; no device/customer location was sent to it.

Production routing is active on the existing Render instance (revision e680b67), using local OSRM with no external route provider. Set SAMOU_ROUTING_ENABLED=true for the API build and start commands. Build preparation downloads the pinned, SHA256-verified As-Samou bundle; the supervisor binds OSRM to 127.0.0.1:5000 and supplies OSRM_BASE_URL to the API child. Router restarts are bounded; API exit or termination stops supervised children. Set SAMOU_ROUTING_ENABLED=false and redeploy to disable this integration.

The bundle covers bbox 34.98,31.30,35.16,31.48. Outside coverage, missing/stale GPS, or an engine failure yields the existing explicit distance fallback, not an invented road. Keep OpenStreetMap attribution. Times exclude live traffic. Real-device GPS and local road access accuracy still require field verification.

Documentation: https://project-osrm.org/docs/v5.24.0/api/#route-service
Demo policy: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
