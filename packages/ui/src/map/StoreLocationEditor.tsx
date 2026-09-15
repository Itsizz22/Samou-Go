import { useEffect, useRef, useState } from 'react';
import { BaseMap } from './BaseMap';
import { validMapPoint, type MapPoint } from './map-data';

export function StoreLocationEditor({ latitude, longitude, onSave, t = (ar) => ar }: { t?: (ar: string, en: string) => string; latitude?: number | null; longitude?: number | null; onSave: (lat: number, lng: number) => Promise<void> }) {
  const [draft, setDraft] = useState<MapPoint | null>(null);
  const [busy, setBusy] = useState(false); const [locating, setLocating] = useState(false); const [message, setMessage] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { const point: MapPoint = [latitude ?? NaN, longitude ?? NaN]; setDraft(validMapPoint(point) ? point : null); }, [latitude, longitude]);
  const valid = draft !== null && validMapPoint(draft);
  function select(lat: number, lng: number) { if (!busy) { setDraft([lat, lng]); setMessage(t('معاينة فقط — اضغط حفظ لتحديث موقع المتجر.', 'Preview only — save to update the store location.')); } }
  function locate() {
    if (!navigator.geolocation) { setMessage(t('حدد النقطة يدويًا؛ GPS غير متاح.', 'GPS unavailable; select the point manually.')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(p => { if (alive.current) { select(p.coords.latitude, p.coords.longitude); setLocating(false); } }, () => { if (alive.current) { setLocating(false); setMessage(t('تعذر تحديد الموقع؛ انقر على الخريطة أو أدخل الإحداثيات.', 'Select on the map or enter coordinates.')); } }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
  }
  async function save() {
    if (!valid || busy || !draft) return;
    const selected: MapPoint = [...draft]; setBusy(true);
    try { await onSave(...selected); if (alive.current) setMessage(t('تم حفظ موقع المتجر. الخريطة تعرض النقطة المحفوظة.', 'Store location saved. The map shows the saved point.')); }
    catch { if (alive.current) setMessage(t('تعذر الحفظ. لم نؤكد تحديث الموقع؛ أعد المحاولة.', 'Save failed; please retry.')); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-line bg-surface p-3" aria-label={t('موقع المتجر', 'Store location')}>
    <h3 className="font-bold">{t('موقع المتجر', 'Store location')}</h3>
    <p className="text-sm text-ink-muted">{t('حدد مدخل المتجر ثم احفظ. لا يتم الحفظ تلقائيًا.', 'Select the store entrance, then save. Changes are not saved automatically.')}</p>
    <BaseMap center={valid ? draft : [31.3967,35.0661]} markers={valid ? [{id:'store-location',kind:'store',position:draft,label:t('موقع المتجر','Store location')}] : []} onPick={select} className="h-64 w-full rounded-xl" />
    <div className="flex flex-wrap gap-2" dir="ltr">
      <label>Lat <input aria-label="Store latitude" type="number" step="any" min={-90} max={90} disabled={busy || locating} value={draft && Number.isFinite(draft[0]) ? draft[0] : ''} onChange={e=>select(e.target.value === '' ? NaN : Number(e.target.value),draft?.[1] ?? NaN)} className="w-28 rounded border border-line p-2" /></label>
      <label>Lng <input aria-label="Store longitude" type="number" step="any" min={-180} max={180} disabled={busy || locating} value={draft && Number.isFinite(draft[1]) ? draft[1] : ''} onChange={e=>select(draft?.[0] ?? NaN,e.target.value === '' ? NaN : Number(e.target.value))} className="w-28 rounded border border-line p-2" /></label>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={locate} disabled={busy || locating} className="min-h-11 rounded-xl border border-line px-3 disabled:opacity-50">{locating ? t('جارٍ التحديد…','Locating…') : t('استخدام موقعي الحالي','Use current location')}</button>
      <button type="button" onClick={()=>void save()} disabled={!valid || busy || locating} className="min-h-11 rounded-xl bg-brand px-3 text-white disabled:opacity-50">{busy ? t('جارٍ الحفظ…','Saving…') : t('حفظ موقع المتجر','Save store location')}</button>
    </div>
    {message && <p role="status" className="text-sm text-ink-muted">{message}</p>}
  </section>;
}
