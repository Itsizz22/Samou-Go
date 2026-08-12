import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export function AdminMap() {
  const center: [number, number] = [31.3971, 35.0716];
  return <MapContainer center={center} zoom={13} className="h-72 w-full rounded-2xl"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={center}><Popup>Samou&apos; Go — منطقة التشغيل</Popup></Marker></MapContainer>;
}
