import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

/**
 * Fix Leaflet default icon paths — Vite/webpack resolve the imported PNGs
 * to hashed URLs, so we wire them into the global default icon instead of
 * relying on CDN URLs that may 404 on restricted networks.
 */
function fixLeafletIcons() {
  L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
  });
}

export interface LeafletMapMarker {
  position: [number, number];
  label: string;
}

export interface LeafletMapProps {
  center: [number, number];
  markers: readonly LeafletMapMarker[];
  zoom?: number;
  className?: string;
}

/**
 * Samou' Go shared operations map (OpenStreetMap via react-leaflet).
 * Renders a marker with a popup per entry in `markers`.
 */
export function LeafletMap({
  center,
  markers,
  zoom = 15,
  className = 'h-64 w-full rounded-2xl',
}: LeafletMapProps) {
  const centerExpr: LatLngExpression = center;
  useEffect(() => { fixLeafletIcons(); }, []);
  return (
    <MapContainer center={centerExpr} zoom={zoom} className={className}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((marker, index) => (
        <Marker key={index} position={marker.position}>
          <Popup>{marker.label}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export default LeafletMap;
