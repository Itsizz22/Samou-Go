import { useEffect, useRef, useState } from 'react';
import { AttributionControl, MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Inline marker avoids asset-path differences between web builds and Capacitor.
const trackingIcon = L.divIcon({
  className: 'text-brand', iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -32],
  html: '<svg viewBox="0 0 28 36" width="28" height="36" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" stroke="white" stroke-width="2" d="M14 1C7 1 1 7 1 14c0 9 13 21 13 21s13-12 13-21C27 7 21 1 14 1Z"/><circle cx="14" cy="14" r="5" fill="white"/></svg>',
});

export interface LeafletMapMarker {
  position: [number, number];
  label: string;
}

export interface LeafletMapProps {
  center: [number, number];
  markers: readonly LeafletMapMarker[];
  route?: readonly [number, number][];
  zoom?: number;
  className?: string;
}

/**
 * Samou' Go shared operations map (OpenStreetMap via react-leaflet).
 * Renders a marker with a popup per entry in `markers`.
 */
function FitMarkers({ markers }: { markers: readonly LeafletMapMarker[] }) {
  const map = useMap(); const positions = JSON.stringify(markers.map(m => m.position));
  useEffect(() => { if (markers.length) map.fitBounds(L.latLngBounds(markers.map(m => m.position)), { padding: [30, 30], maxZoom: 16, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, duration: 0.9 }); }, [map, positions]);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      if (markers.length) map.fitBounds(L.latLngBounds(markers.map(m => m.position)), { padding: [40, 40], maxZoom: 16, animate: false });
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, positions]);
  return null;
}
function MovingMarker({ marker }: { marker: LeafletMapMarker }) {
  const ref = useRef<L.Marker>(null);
  const initial = useRef(marker.position);
  const [lat, lng] = marker.position;
  useEffect(() => {
    const pin = ref.current;
    if (!pin) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { pin.setLatLng([lat, lng]); return; }
    const from = pin.getLatLng(); const started = performance.now(); let frame = 0;
    function move(now: number) {
      const progress = Math.min(1, (now - started) / 900);
      const eased = progress * (2 - progress);
      pin?.setLatLng([from.lat + (lat - from.lat) * eased, from.lng + (lng - from.lng) * eased]);
      if (progress < 1) frame = requestAnimationFrame(move);
    }
    frame = requestAnimationFrame(move);
    return () => cancelAnimationFrame(frame);
  }, [lat, lng]);
  return <Marker ref={ref} icon={trackingIcon} position={initial.current}><Popup>{marker.label}</Popup></Marker>;
}
export function LeafletMap({
  center,
  markers,
  route = [],
  zoom = 15,
  className = 'h-64 w-full rounded-2xl',
}: LeafletMapProps) {
  const [tileError, setTileError] = useState(false);
  const centerExpr: LatLngExpression = center;
  return (
    <MapContainer center={centerExpr} zoom={zoom} zoomControl={false} attributionControl={false} className={`samou-map isolate overflow-hidden border border-line ${className}`}>
            <style>{`
        .samou-map .samou-road-route { stroke: var(--color-brand); }
        .samou-map .leaflet-control-attribution { margin: 0 6px 6px 0; padding: 2px 6px; border-radius: 6px; background: rgb(255 255 255 / 90%); color: rgb(71 85 105); font: 10px/1.5 system-ui, sans-serif; direction: ltr; }
        .samou-map .leaflet-control-attribution a { color: inherit; text-decoration: none; }
        .samou-map .leaflet-control-attribution a:hover { text-decoration: underline; }
        .samou-map .leaflet-control-attribution a:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
        .samou-map .leaflet-control-zoom { border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgb(15 23 42 / 10%); }
        .samou-map .leaflet-control-zoom a { width: 44px; height: 44px; line-height: 44px; color: var(--color-brand); background: var(--color-surface, white); border-color: var(--color-line); }
        .samou-map .leaflet-control-zoom a:hover { background: var(--color-surface-muted, whitesmoke); }
        .samou-map .leaflet-popup-content-wrapper { border-radius: 14px; font-family: inherit; }
        .samou-map .leaflet-popup-content { direction: rtl; text-align: start; }
      `}</style>
      <AttributionControl prefix={false} position="bottomright" />
      <ZoomControl position="bottomleft" zoomInTitle="تكبير الخريطة" zoomOutTitle="تصغير الخريطة" />
      <FitMarkers markers={[...markers, ...route.map(position => ({ position, label: '' }))]} />
      {route.length > 1 && <><Polyline positions={[...route]} pathOptions={{ color: 'white', weight: 9, opacity: 0.9 }} /><Polyline positions={[...route]} pathOptions={{ color: 'var(--color-brand)', weight: 5, opacity: 0.95 }} /></>}
      {tileError && <div role="status" className="absolute inset-x-2 top-2 z-[1000] rounded-xl bg-surface p-2 text-sm text-ink shadow-card">تعذر تحميل بعض أجزاء الخريطة؛ تحقق من الإنترنت. العنوان والمسافة يبقيان متاحين عند وصول الموقع.</div>}
      <TileLayer
        eventHandlers={{ tileerror: () => setTileError(true) }}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((marker, index) => (
        <MovingMarker key={index} marker={marker} />
      ))}
    </MapContainer>
  );
}

export default LeafletMap;
