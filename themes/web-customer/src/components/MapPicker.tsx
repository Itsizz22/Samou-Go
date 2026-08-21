/**
 * Interactive map picker — drop a pin on an OpenStreetMap canvas to capture
 * exact GPS coordinates for delivery. Uses Leaflet + react-leaflet.
 *
 * The component is a controlled modal; the parent owns `isOpen`, `onPick`,
 * and `onClose`. On mobile it takes the full screen; on desktop it's a
 * centered 400×500 card.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ArrowRight, Crosshair, X } from 'lucide-react';
import { useLanguage } from '@samou-go/ui';

// Default center: Samou' area (Bethlehem Governorate, Palestine)
const SAMOU_LAT = 31.705;
const SAMOU_LNG = 35.208;

// Custom pin icon (inline SVG data URI — avoids external file deps)
const PIN_ICON = new L.DivIcon({
  className: '',
  iconSize: [28, 36],
  iconAnchor: [14, 36],
  html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#E04B2F"/>
    <circle cx="14" cy="13" r="6" fill="white"/>
  </svg>`,
});

// Force Leaflet to re-measure its container on open/resise
function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

// Draggable marker component
function DragMarker({
  position,
  onMove,
}: {
  position: L.LatLngTuple;
  onMove: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);

  return (
    <Marker
      position={position}
      icon={PIN_ICON}
      ref={markerRef}
      draggable
      eventHandlers={{
        dragend() {
          const m = markerRef.current;
          if (!m) return;
          const { lat, lng } = m.getLatLng();
          onMove(lat, lng);
        },
      }}
    />
  );
}

// Click-to-move handler
function ClickHandler({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Geolocation button — recenters the map to the user's position
function LocateButton({ onLocate }: { onLocate: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onLocate}
      aria-label={t('موقعي', 'My location')}
      className="absolute bottom-4 start-4 z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-card transition active:scale-95"
    >
      <Crosshair size={18} className="text-brand" />
    </button>
  );
}

export interface MapPickerProps {
  isOpen: boolean;
  /** Initial coordinates to centre the map (e.g. from the saved address). */
  initialLat?: number;
  initialLng?: number;
  onPick: (lat: number, lng: number) => void;
  onClose: () => void;
}

export function MapPicker({ isOpen, initialLat, initialLng, onPick, onClose }: MapPickerProps) {
  const { t } = useLanguage();
  const center: L.LatLngTuple = [
    initialLat ?? SAMOU_LAT,
    initialLng ?? SAMOU_LNG,
  ];
  const [picked, setPicked] = useState<L.LatLngTuple>(center);

  // Reset picked position when the modal opens with new coords
  useEffect(() => {
    if (isOpen) setPicked(center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialLat, initialLng]);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setPicked([lat, lng]);
      },
      () => { /* user denied or no GPS — keep current */ },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-canvas">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('إغلاق', 'Close')}
          className="rounded-full p-2 transition hover:bg-canvas active:scale-95"
        >
          <X size={20} />
        </button>
        <h2 className="text-sm font-extrabold">{t('حدد موقع التوصيل', 'Set delivery location')}</h2>
        <button
          type="button"
          onClick={() => { onPick(picked[0], picked[1]); onClose(); }}
          className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white transition active:scale-95"
        >
          {t('تأكيد', 'Confirm')}
        </button>
      </header>

      {/* Map */}
      <div className="relative flex-1">
        <MapContainer
          center={picked}
          zoom={15}
          className="h-full w-full"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <DragMarker position={picked} onMove={(lat, lng) => setPicked([lat, lng])} />
          <ClickHandler onMove={(lat, lng) => setPicked([lat, lng])} />
          <InvalidateSize />
        </MapContainer>

        {/* Center crosshair (static, purely visual) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-[2.5px] border-brand" />
        </div>

        {/* GPS locate */}
        <LocateButton onLocate={handleLocate} />

        {/* Coordinate badge */}
        <div className="absolute top-3 start-3 z-[1000] rounded-lg bg-surface/90 px-3 py-1.5 text-[10px] font-bold text-ink-muted shadow-card" dir="ltr">
          {picked[0].toFixed(5)}, {picked[1].toFixed(5)}
        </div>
      </div>

      {/* Bottom hint */}
      <div className="bg-surface px-4 py-3 text-center text-[11px] text-ink-muted">
        {t('انقر على الخريطة لتحديد الموقع، أو اسحب العلامة', 'Tap the map to place the pin, or drag it')}
      </div>
    </div>
  );
}
