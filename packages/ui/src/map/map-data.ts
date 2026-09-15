import type { FeatureCollection, LineString } from 'geojson';
/** Public component coordinates remain [latitude, longitude] for API compatibility. */
export type MapPoint = [number, number];
export function validMapPoint(value: readonly number[]): value is MapPoint {
  return value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0]!) <= 90 && Math.abs(value[1]!) <= 180;
}
export function mapboxPoint(point: MapPoint): [number, number] {
  return [point[1], point[0]];
}
export function routeGeoJSON(points: readonly MapPoint[]): FeatureCollection<LineString> {
  // Reject the entire malformed route instead of connecting gaps with invented lines.
  return { type: 'FeatureCollection', features: points.length > 1 && points.every(validMapPoint) ? [{
    type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map(mapboxPoint) },
  }] : [] };
}
export interface MapMarker {
  id?: string;
  position: MapPoint;
  label: string;
  kind?: 'store' | 'captain' | 'destination' | 'user';
  stale?: boolean;
}
export interface BaseMapProps {
  center: MapPoint;
  markers: readonly MapMarker[];
  route?: readonly MapPoint[];
  zoom?: number;
  className?: string;
  onPick?: (lat: number, lng: number) => void;
  onMarkerSelect?: (marker: MapMarker) => void;
  /** Change only when order stage/context changes, not every GPS sample. */
  fitKey?: string;
}
