import { useEffect, useState } from 'react';
import { BaseMap, validMapPoint, type MapPoint } from './BaseMap';

export function PickupDirections({ store }: { store: { nameAr: string; latitude: number | null; longitude: number | null } }) {
  const [position, setPosition] = useState<MapPoint | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('');
  const [route, setRoute] = useState<MapPoint[]>([]);
  const lat = store.latitude;
  const lng = store.longitude;
  const target: MapPoint | null = lat != null && lng != null && validMapPoint([lat, lng]) ? [lat, lng] : null;
  useEffect(() => {
    let active = true;
    setPosition(null);
    if (!navigator.geolocation) { setMessage('تحديد الموقع غير مدعوم على هذا الجهاز.'); return; }
    setMessage('جارٍ تحديد موقعك لعرض الطريق إلى المتجر…');
    navigator.geolocation.getCurrentPosition(p => {
      if (active) { setPosition([p.coords.latitude, p.coords.longitude]); setMessage(''); }
    }, () => { if (active) setMessage('تعذر تحديد موقعك. اسمح بالوصول إلى الموقع ثم أعد المحاولة، أو افتح الاتجاهات.'); },
    { timeout: 12000, maximumAge: 30000, enableHighAccuracy: true });
    return () => { active = false; };
  }, [attempt, lat, lng]);
  useEffect(() => {
    setRoute([]);
    if (!position || lat == null || lng == null || !validMapPoint([lat, lng])) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let active = true;
    async function loadRoute() {
      setMessage('جارٍ تحميل الطريق إلى المتجر…');
      try {
        const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
        if (!token) throw new Error('Map unavailable');
        const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${position![1]},${position![0]};${lng},${lat}`);
        url.search = new URLSearchParams({ access_token: token, geometries: 'geojson', overview: 'full', radiuses: '100;100' }).toString();
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Route unavailable');
        const data = await response.json() as { code?: string; routes?: { geometry?: { coordinates?: number[][] } }[] };
        const coordinates = data.routes?.[0]?.geometry?.coordinates;
        if (data.code !== 'Ok' || !coordinates || coordinates.length < 2 || !coordinates.every(p => p.length === 2 && validMapPoint([p[1]!, p[0]!]))) throw new Error('Invalid route');
        if (active) { setRoute(coordinates.map(p => [p[1]!, p[0]!])); setMessage('مسار القيادة من موقعك إلى المتجر'); }
      } catch { if (active) setMessage('تعذر تحميل مسار الشوارع. يمكنك فتح الاتجاهات إلى المتجر.'); }
      finally { clearTimeout(timer); }
    }
    void loadRoute();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [position, lat, lng]);
  return <section className="space-y-3 rounded-2xl border border-line bg-surface p-4" dir="rtl">
    <h2 className="font-bold">الاستلام من المتجر</h2>
    <p className="text-sm text-ink-muted">توجّه إلى {store.nameAr} عندما يصبح طلبك جاهزًا للاستلام.</p>
    {target ? <>
      <BaseMap center={target} route={route} markers={[{ id: 'store', kind: 'store', position: target, label: store.nameAr }, ...(position ? [{ id: 'customer', kind: 'user' as const, position, label: 'موقعك الحالي' }] : [])]} className="h-64 rounded-xl" />
      <button type="button" onClick={() => setAttempt(n => n + 1)} className="min-h-11 w-full rounded-xl border border-line text-brand">تحديث موقعي والطريق إلى المتجر</button>
      <a className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-3 text-white" href={`https://www.google.com/maps/dir/?api=1&destination=${target.join(',')}${position ? '&origin=' + position.join(',') : ''}`} target="_blank" rel="noopener noreferrer">الاتجاهات إلى المتجر</a>
    </> : <p role="status" className="text-sm">لم يحدد المتجر موقعه بعد؛ تواصل معه لمعرفة العنوان.</p>}
    {target && message && <p role="status" className="text-sm text-ink-muted">{message}</p>}
  </section>;
}
