import { useEffect, useRef, useState } from 'react';
import { BaseMap, validMapPoint, type MapPoint } from '@samou-go/ui/map';
import { useLanguage } from '@samou-go/ui';
import { X, Crosshair } from 'lucide-react';
export interface MapPickerProps {
  isOpen: boolean; initialLat?: number; initialLng?: number;
  onPick: (lat: number, lng: number) => void; onClose: () => void;
}
export function MapPicker({ isOpen, initialLat, initialLng, onPick, onClose }: MapPickerProps) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<MapPoint>([31.3967, 35.0661]);
  const [confirmedPoint, setConfirmedPoint] = useState(false);
  const [notice, setNotice] = useState('');
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const initial: MapPoint = [initialLat ?? NaN, initialLng ?? NaN];
    setPicked(validMapPoint(initial) ? initial : [31.3967, 35.0661]);
    setConfirmedPoint(validMapPoint(initial)); setNotice('');
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const previouslyFocused = document.activeElement;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape); if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus(); };
  }, [isOpen, initialLat, initialLng]);
  function select(lat: number, lng: number) { const point: MapPoint = [lat, lng]; if (validMapPoint(point)) { setPicked(point); setConfirmedPoint(true); } }
  function locate() {
    if (!navigator.geolocation) { setNotice(t('الموقع غير مدعوم؛ حدد النقطة يدويًا.', 'Select your location manually.')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      select(position.coords.latitude, position.coords.longitude); setLocating(false); setNotice('');
    }, () => { setLocating(false); setNotice(t('تعذر تحديد موقعك؛ اسمح بالوصول للموقع أو حدد النقطة يدويًا.', 'Allow location access or select a point manually.')); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }
  if (!isOpen) return null;
  return <div ref={dialog} role="dialog" aria-modal="true" aria-label={t('حدد موقع التوصيل','Set delivery location')} className="fixed inset-0 z-[1000] flex flex-col bg-canvas" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
    <header className="flex items-center justify-between gap-2 border-b border-line bg-surface p-3">
      <button autoFocus type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-full" aria-label={t('إغلاق','Close')}><X className="mx-auto" size={20} /></button>
      <h2 className="text-sm font-bold">{t('حدد موقع التوصيل','Set delivery location')}</h2>
      <button type="button" disabled={!confirmedPoint} onClick={() => { onPick(...picked); onClose(); }} className="min-h-11 rounded-xl bg-brand px-4 font-bold text-white disabled:opacity-50">{t('تأكيد','Confirm')}</button>
    </header>
    <div className="relative min-h-0 flex-1">
      <BaseMap center={picked} markers={confirmedPoint ? [{ id: 'selected', kind: 'destination', position: picked, label: t('موقع التسليم','Delivery location') }] : []} onPick={select} className="h-full w-full" />
      <button type="button" disabled={locating} onClick={locate} aria-label={t('موقعي','My location')} className="absolute end-3 bottom-12 flex min-h-11 items-center gap-2 rounded-xl bg-surface px-3 text-brand shadow-card"><Crosshair size={18} />{locating ? t('جارٍ التحديد…','Locating…') : t('موقعي','My location')}</button>
    </div>
    <footer className="space-y-2 bg-surface p-3 text-center text-xs text-ink-muted">
      {notice && <p role="status">{notice}</p>}
      <p>{t('انقر على الخريطة أو اسحب العلامة ثم أكد موقعك.','Tap the map or drag the pin, then confirm.')}</p>
      <div className="flex justify-center gap-2" dir="ltr">
        <label>Lat <input aria-label="Latitude" type="number" min={-90} max={90} step="any" value={Number.isFinite(picked[0]) ? picked[0] : ''} onChange={event => { const next: MapPoint = [event.target.value === '' ? NaN : Number(event.target.value), picked[1]]; setPicked(next); setConfirmedPoint(validMapPoint(next)); }} className="w-24 rounded border border-line p-2" /></label>
        <label>Lng <input aria-label="Longitude" type="number" min={-180} max={180} step="any" value={Number.isFinite(picked[1]) ? picked[1] : ''} onChange={event => { const next: MapPoint = [picked[0], event.target.value === '' ? NaN : Number(event.target.value)]; setPicked(next); setConfirmedPoint(validMapPoint(next)); }} className="w-24 rounded border border-line p-2" /></label>
      </div>
    </footer>
  </div>;
}
