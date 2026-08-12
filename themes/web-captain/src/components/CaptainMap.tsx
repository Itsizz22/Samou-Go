import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function CaptainMap({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) {
  const center: LatLngExpression = [latitude, longitude];
  return <MapContainer center={center} zoom={15} className="h-64 w-full rounded-2xl"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={center}><Popup>{label}</Popup></Marker></MapContainer>;
}
