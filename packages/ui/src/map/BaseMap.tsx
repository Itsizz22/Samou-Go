import { lazy, Suspense } from 'react';
import type { BaseMapProps } from './map-data';
export type { BaseMapProps, MapMarker, MapPoint } from './map-data';
export { validMapPoint, mapboxPoint, routeGeoJSON } from './map-data';
const Renderer = lazy(() => import('./BaseMapImpl'));
export function BaseMap(props: BaseMapProps) {
  return <Suspense fallback={<div className={props.className ?? 'h-64 w-full'} role="status">جارٍ تحميل الخريطة…</div>}><Renderer {...props} /></Suspense>;
}
