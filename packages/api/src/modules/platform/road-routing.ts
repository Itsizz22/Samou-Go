import { z } from 'zod';
import type { RoadRoute, TrackingPoint } from '@samou-go/shared-types';

const point = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const resultSchema = z.object({
  code: z.literal('Ok'),
  waypoints: z.array(z.object({ distance: z.number().nonnegative().max(150) })).length(2),
  routes: z.array(z.object({
    distance: z.number().finite().nonnegative(), duration: z.number().finite().nonnegative(),
    geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(point).min(2).max(10000) }),
  })).min(1),
});

/** Only operator-configured OSRM endpoints; never silently use a public demo. */
export function createRoadRouter(baseUrl: string | undefined, fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; value: Promise<RoadRoute | null> }>();
  return async (from: TrackingPoint, to: TrackingPoint): Promise<RoadRoute | null> => {
    if (!baseUrl || ![from.lat, from.lng, to.lat, to.lng].every(Number.isFinite) ||
        Math.abs(from.lat) > 90 || Math.abs(to.lat) > 90 || Math.abs(from.lng) > 180 || Math.abs(to.lng) > 180) return null;
    const key = [from.lng, from.lat, to.lng, to.lat].map(n => n.toFixed(5)).join(',');
    const previous = cache.get(key);
    if (previous && previous.expires > Date.now()) return previous.value;
    if (cache.size >= 500) { const oldest = cache.keys().next().value; if (oldest) cache.delete(oldest); }
    const value = (async () => {
      try {
        const url = new URL(`${baseUrl.replace(/\/$/, '')}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`);
        if (!['https:', 'http:'].includes(url.protocol)) return null;
        url.search = new URLSearchParams({ geometries: 'geojson', overview: 'full', steps: 'false', alternatives: 'false', radiuses: '150;150' }).toString();
        const response = await fetcher(url, { signal: AbortSignal.timeout(2500), redirect: 'error' });
        if (!response.ok) return null;
        const parsed = resultSchema.safeParse(await response.json());
        if (!parsed.success) return null;
        const route = parsed.data.routes[0];
        if (!route) return null;
        return { distanceMeters: Math.round(route.distance), durationSeconds: Math.round(route.duration),
          coordinates: route.geometry.coordinates.map(([lng, lat]): [number, number] => [lat, lng]),
          calculatedAt: new Date().toISOString(), trafficAware: false as const };
      } catch { return null; }
    })();
    cache.set(key, { expires: Date.now() + 20000, value });
    return value;
  };
}
