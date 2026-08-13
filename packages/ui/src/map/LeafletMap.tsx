import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
