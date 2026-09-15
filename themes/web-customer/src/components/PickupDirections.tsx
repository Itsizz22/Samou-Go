import { useState } from 'react';
import { LeafletMap } from '@samou-go/ui/map';
export function PickupDirections({ store }: { store: { nameAr: string; latitude: number | null; longitude: number | null } }) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState('');
  const target: [number, number] | null = store.latitude != null && store.longitude != null ? [store.latitude, store.longitude] : null;
  function locate() {
    if (!navigator.geolocation) { setMessage('تحديد الموقع غير مدعوم على هذا الجهاز.'); return; }
    setMessage('جارٍ تحديد موقعك…');
    navigator.geolocation.getCurrentPosition(p => { setPosition([p.coords.latitude, p.coords.longitude]); setMessage(''); }, () => setMessage('تعذر تحديد موقعك. يمكنك فتح الاتجاهات لتحديد نقطة الانطلاق هناك.'), { timeout: 12000, maximumAge: 30000 });
  }
  return <section className="space-y-3 rounded-2xl border border-line bg-surface p-4" dir="rtl">
    <h2 className="font-bold">الاستلام من المتجر</h2>
    <p className="text-sm text-ink-muted">توجّه إلى {store.nameAr} عندما يصبح طلبك جاهزًا للاستلام.</p>
    {target ? <>
      <LeafletMap center={target} markers={[{ position: target, label: store.nameAr }, ...(position ? [{ position, label: 'موقعك الحالي' }] : [])]} className="h-64 rounded-xl" />
      <button type="button" onClick={locate} className="min-h-11 w-full rounded-xl border border-line text-brand">إظهار موقعي على الخريطة</button>
      <a className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-3 text-white" href={`https://www.google.com/maps/dir/?api=1&destination=${target.join(',')}${position ? '&origin=' + position.join(',') : ''}`} target="_blank" rel="noopener noreferrer">الاتجاهات إلى المتجر</a>
    </> : <p role="status" className="text-sm">لم يحدد المتجر موقعه بعد؛ تواصل معه لمعرفة العنوان.</p>}
    {message && <p role="status" className="text-sm text-ink-muted">{message}</p>}
  </section>;
}
