import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function OrderMap({ store, captain }: { store: { latitude: number; longitude: number; name: string }; captain?: { lat: number; lng: number } | null }) {
  const center: LatLngExpression = captain ? [captain.lat, captain.lng] : [store.latitude, store.longitude];
  return <MapContainer center={center} zoom={15} className="h-64 w-full rounded-2xl"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={[store.latitude, store.longitude]}><Popup>{store.name}</Popup></Marker>{captain && <Marker position={[captain.lat, captain.lng]}><Popup>السائق / Captain</Popup></Marker>}</MapContainer>;
}
