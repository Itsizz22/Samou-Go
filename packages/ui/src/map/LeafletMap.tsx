import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const LEAFLET_VERSION = '1.9.4';
const ICON_BASE = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images`;

/**
 * Fix Leaflet default icon paths — without this, markers show a broken-image
 * 404 because the bundled asset paths don't match what Leaflet expects by
 * default. We use the unpkg CDN as the icon source, which is reliable and
 * works across all build systems (tsc, Vite, webpack).
 */
function fixLeafletIcons() {
  void import('leaflet').then((L) => {
    L.Icon.Default.mergeOptions({
      iconUrl: `${ICON_BASE}/marker-icon.png`,
      iconRetinaUrl: `${ICON_BASE}/marker-icon-2x.png`,
      shadowUrl: `${ICON_BASE}/marker-shadow.png`,
    });
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
  useEffect(fixLeafletIcons, []);
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
