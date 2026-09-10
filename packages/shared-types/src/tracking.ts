export interface TrackingPoint { lat: number; lng: number; }
export interface LiveOrderTracking {
  enabled: boolean;
  stage: 'store' | 'customer' | 'complete';
  location: (TrackingPoint & { updatedAt: string }) | null;
  destination: (TrackingPoint & { label: string }) | null;
  store: (TrackingPoint & { label: string }) | null;
  address: string;
  zone: string | null;
  distanceMeters: number | null;
  distanceKind: 'straight-line';
  stale: boolean;
}
export function directDistanceMeters(a: TrackingPoint, b: TrackingPoint): number | null {
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite) || Math.abs(a.lat) > 90 || Math.abs(b.lat) > 90 || Math.abs(a.lng) > 180 || Math.abs(b.lng) > 180) return null;
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h)))));
}
