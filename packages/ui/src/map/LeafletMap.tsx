/** Compatibility export for older consumers; all rendering now uses Mapbox. */
export { BaseMap as LeafletMap, BaseMap as default } from './BaseMap';
export type { BaseMapProps as LeafletMapProps, MapMarker as LeafletMapMarker } from './map-data';
