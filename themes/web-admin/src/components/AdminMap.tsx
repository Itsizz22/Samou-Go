import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export function AdminMap({ height }: { height?: string } = {}) {
  const center: [number, number] = [31.3971, 35.0716];
  const mapHeight = height || 'h-80';
  return (
    <div className="h-full w-full overflow-hidden rounded-b-2xl">
      <MapContainer center={center} zoom={13} className={`${mapHeight} z-0`}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={center}>
          <Popup>Samou' Go — منطقة التشغيل</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
