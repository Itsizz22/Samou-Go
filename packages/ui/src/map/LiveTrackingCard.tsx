import { useEffect, useRef, useState } from 'react';
import type { LiveOrderTracking } from '@samou-go/shared-types';
import { LeafletMap } from './LeafletMap';
export function LiveTrackingCard({ orderId, load }: { orderId: string; load: (id: string, signal?: AbortSignal) => Promise<LiveOrderTracking> }) {
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const dialog = dialogRef.current; dialog?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previous; };
  }, [expanded]);
  const [data, setData] = useState<LiveOrderTracking | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setData(null); setError(false);
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const result = await load(orderId, controller.signal); if (!controller.signal.aborted) { setData(result); setError(false); } }
      catch { if (!controller.signal.aborted) setError(true); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 10000);
    }
    void poll(); const clock = setInterval(() => setNow(Date.now()), 10000);
    return () => { controller.abort(); clearTimeout(timer); clearInterval(clock); };
  }, [orderId, load, retry]);
  const stale = error || !data?.location || now - Date.parse(data.location.updatedAt) > 60000 || data.stale;
  const route = !stale && data?.enabled && data.stage !== 'complete' && data.route && now - Date.parse(data.route.calculatedAt) < 60000 ? data.route : null;
  const meters = !stale ? route?.distanceMeters ?? data?.distanceMeters : null;
  const distanceLabel = route ? 'مسافة الطريق' : 'مسافة مباشرة تقريبية';
  const routeNotice = route ? `وصول تقديري خلال ${Math.max(1, Math.ceil(route.durationSeconds / 60))} دقيقة · لا يشمل حركة المرور أو وقت التحضير` : 'مسار الشوارع غير متاح حاليًا؛ المسافة بخط مستقيم وليست وقت وصول.';
  const markers = data ? [...(data.store ? [{ position: [data.store.lat, data.store.lng] as [number, number], label: data.store.label }] : []), ...(data.destination && data.stage === 'customer' ? [{ position: [data.destination.lat, data.destination.lng] as [number, number], label: data.destination.label }] : []), ...(data.location ? [{ position: [data.location.lat, data.location.lng] as [number, number], label: stale ? 'آخر موقع معروف للكابتن' : 'الكابتن' }] : [])] : [];
  return <section dir="rtl" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
    <div className="space-y-2 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">تتبع التوصيل</h3><button type="button" className="rounded-xl border border-line px-3 py-2 text-sm text-brand" onClick={() => setRetry(n => n + 1)}>تحديث</button></div>
      {error && <p role="alert">تعذر تحديث الموقع. تحقق من الاتصال وأعد المحاولة.</p>}
      {!data && !error && <p role="status">جارٍ تحميل الموقع…</p>}
      {data && <>
        {!data.enabled && <p role="status">التتبع متوقف من إعدادات الإدارة</p>}<p className="text-sm text-ink-muted">{data.stage === 'complete' ? 'انتهى التتبع لهذا الطلب' : data.stage === 'store' ? 'الكابتن باتجاه المتجر' : 'الكابتن باتجاه موقع التسليم'}</p>
        <p className="text-xl font-bold text-brand">{meters != null ? <><span dir="ltr">{meters < 1000 ? Math.round(meters) + ' م' : (meters / 1000).toFixed(1) + ' كم'}</span> <span className="text-sm">{distanceLabel}</span></> : data.stage === 'complete' ? '—' : 'المسافة غير متاحة حاليًا'}</p>
        <p className="text-xs text-ink-muted">{routeNotice}</p>
        {data.stage !== 'complete' && <p role="status" className="text-sm">{stale ? 'بانتظار موقع حديث من الكابتن' : 'الموقع محدّث'}{data.location ? ' · ' + new Date(data.location.updatedAt).toLocaleTimeString('ar') : ''}</p>}
        <p className="text-sm">{data.zone ? data.zone + ' · ' : ''}{data.address}</p>
        {!data.destination && data.stage !== 'complete' && <p className="text-sm">لم يُحدد موقع الوجهة على الخريطة؛ استخدم العنوان النصي للتواصل.</p>}
      </>}
    </div>
    {data?.enabled && markers[0] && data?.stage !== 'complete' && <div className="px-3 pb-3">
      <button type="button" onClick={() => setExpanded(true)} className="mb-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-bold text-white">⛶ عرض الخريطة بملء الشاشة</button>
      <LeafletMap center={markers[0].position} markers={markers} route={route?.coordinates} className="h-72 w-full rounded-2xl" />
    </div>}
    {expanded && <dialog ref={dialogRef} onCancel={() => setExpanded(false)} aria-label="خريطة تتبع التوصيل" dir="rtl" style={{ width: '100vw', maxWidth: 'none', height: '100dvh', maxHeight: 'none', margin: 0, padding: 0, border: 0 }} className="bg-surface text-ink">
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
          <div><h2 className="font-bold">تتبع التوصيل</h2><p className="text-xs text-ink-muted">{data?.stage === 'store' ? 'باتجاه المتجر' : 'باتجاه العميل'}</p></div>
          <button autoFocus type="button" onClick={() => setExpanded(false)} className="min-h-11 rounded-xl border border-line px-4 font-bold text-brand">العودة ←</button>
        </header>
        <div className="relative min-h-0 flex-1">
          {data?.enabled && data.stage !== 'complete' && markers[0] ? <LeafletMap center={markers[0].position} markers={markers} route={route?.coordinates} className="h-full w-full" /> : <p className="p-6">التتبع غير متاح لهذا الطلب حاليًا</p>}
        </div>
        <footer className="shrink-0 space-y-1 border-t border-line bg-surface px-4 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center justify-between gap-2"><strong className="text-lg text-brand">{meters != null ? <span dir="ltr">{meters < 1000 ? Math.round(meters) + ' م' : (meters / 1000).toFixed(1) + ' كم'}</span> : stale ? 'بانتظار الموقع' : 'المسافة غير متاحة'}</strong><span className="text-xs text-ink-muted">{distanceLabel}</span></div>
          <p className="text-sm">{data?.zone}{data?.address ? ' · ' + data.address : ''}</p>
          <p role="status" className="text-xs text-ink-muted">{stale ? 'بانتظار تحديث موقع الكابتن' : 'الموقع محدّث'} · {routeNotice}</p>
        </footer>
      </div>
    </dialog>}
  </section>;
}
export function OrderTrackingToggle({ orderId, load }: { orderId: string; load: (id: string, signal?: AbortSignal) => Promise<LiveOrderTracking> }) {
  const [open, setOpen] = useState(false);
  return <div className="space-y-2"><button type="button" aria-expanded={open} className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-brand" onClick={() => setOpen(v => !v)}>{open ? 'إخفاء التتبع' : 'تتبع الكابتن والمسافة'}</button>{open && <LiveTrackingCard orderId={orderId} load={load} />}</div>;
}
