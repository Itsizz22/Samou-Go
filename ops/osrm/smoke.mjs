// Synthetic coordinates only; no live customer or captain locations.
import assert from 'node:assert/strict';
const origin = process.env.OSRM_TEST_URL || 'http://127.0.0.1:5000';
const url = `${origin}/route/v1/driving/35.0661,31.3967;35.0700,31.4010?geometries=geojson&overview=full&radiuses=150;150`;
const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
assert.equal(response.status, 200);
const body = await response.json();
assert.equal(body.code, 'Ok');
const route = body.routes?.[0];
assert.ok(route?.distance > 0 && route.duration > 0);
assert.equal(route.geometry.type, 'LineString');
assert.ok(route.geometry.coordinates.length > 2, 'Expected road geometry, not a straight connector');
assert.ok(body.waypoints.every(p => p.distance <= 150));
console.log(JSON.stringify({ok:true, distanceMeters:route.distance, durationSeconds:route.duration, points:route.geometry.coordinates.length}));
