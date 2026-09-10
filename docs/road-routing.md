# Road routing integration

Configure OSRM_BASE_URL on the API with an operator-managed, OSRM-compatible driving service. No public demo endpoint is enabled by default. Existing GPS and saved destination coordinates are required.

The API requests GeoJSON road geometry, distance in metres, and duration in seconds. It changes destination from store to customer when the order becomes ON_THE_WAY. Requests time out after 2.5 seconds, coalesce for matching endpoints, and cache for 20 seconds (maximum 500 entries). Coordinates are only sent to the configured service. Responses with malformed geometry or waypoints snapped more than 150m away are rejected.

The shared map renders a brand-colour road polyline in compact and fullscreen modes. Route geometry participates in map bounds. Old/missing locations hide the route. Failed/unconfigured routing retains explicitly labelled straight-line distance without inventing a line or ETA. Duration is a driving estimate, not live traffic or preparation time.

Validation: 38 routing/lifecycle tests passed. One public-demo request using synthetic As-Samou endpoints returned 875.9m / 160.3s / 38 geometry points; browser preview rendered the road polyline with the semantic brand colour. Public demo was used only for this development check; no device/customer location was sent to it.

Production activation remains pending an operator-provided routing endpoint. No subscription or production route-provider change was made.

Documentation: https://project-osrm.org/docs/v5.24.0/api/#route-service
Demo policy: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
