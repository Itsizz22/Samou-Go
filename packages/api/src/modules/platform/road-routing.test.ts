import { describe, expect, it, vi } from 'vitest';
import { createRoadRouter } from './road-routing';
const from = { lat: 31.3967, lng: 35.0661 };
const to = { lat: 31.401, lng: 35.07 };
const payload = { code: 'Ok', waypoints: [{ distance: 4 }, { distance: 5 }], routes: [{ distance: 1200, duration: 180, geometry: { type: 'LineString', coordinates: [[35.0661, 31.3967], [35.068, 31.4], [35.07, 31.401]] } }] };
describe('road routing', () => {
  it('uses lon/lat on the wire and converts to Leaflet lat/lon; coalesces requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(payload)));
    const router = createRoadRouter('https://routing.example.test', fetcher);
    const [a,b] = await Promise.all([router(from,to),router(from,to)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/35.0661,31.3967;35.07,31.401');
    expect(a).toEqual(b); expect(a?.coordinates[0]).toEqual([31.3967,35.0661]);
    expect(a?.distanceMeters).toBe(1200); expect(a?.durationSeconds).toBe(180);
  });
  it('never contacts a default public provider or invalid coordinates', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await createRoadRouter(undefined,fetcher)(from,to)).toBeNull();
    expect(await createRoadRouter('https://routing.example.test',fetcher)({lat:99,lng:0},to)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('fetches again after destination changes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify(payload)));
    const router = createRoadRouter('https://routing.example.test',fetcher);
    await router(from,to); await router(from,{...to,lng:35.08});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([{code:'NoRoute'}, {...payload,waypoints:[{distance:500},{distance:5}]}, {...payload,routes:[]}, {...payload,routes:[{...payload.routes[0],duration:-10}]}])('rejects unusable geometry or snapped endpoints', async body => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body)));
    expect(await createRoadRouter('https://routing.example.test',fetcher)(from,to)).toBeNull();
  });
  it('degrades on network timeout', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout'));
    expect(await createRoadRouter('https://routing.example.test',fetcher)(from,to)).toBeNull();
  });
});
