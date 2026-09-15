import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStores } from '@samou-go/api-client';
import { STORE_TYPE_LABELS, type Store } from '@samou-go/shared-types';
import { BaseMap, validMapPoint, type MapMarker } from '@samou-go/ui/map';
export function StoreDiscoveryMap() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const first = await getStores({ page: 1, pageSize: 250 }, controller.signal, false);
        const all = [...first.items];
        for (let page = 2; page <= first.totalPages; page++) all.push(...(await getStores({ page, pageSize: 250 }, controller.signal, false)).items);
        if (!controller.signal.aborted) { setStores(all.filter(store => store.isActive && store.isApproved && store.latitude != null && store.longitude != null && validMapPoint([store.latitude, store.longitude]))); setError(false); }
      } catch { if (!controller.signal.aborted) { setError(true); setStores([]); } }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 60000);
    }
    void refresh(); return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  const selected = stores.find(store => store.id === selectedId);
  const markers: MapMarker[] = stores.map(store => ({ id: store.id, kind: 'store', position: [store.latitude!, store.longitude!], label: store.nameAr }));
  return <section className="market-section" aria-labelledby="store-map-title" dir="rtl">
    <div className="market-section-heading"><h2 id="store-map-title">المتاجر على الخريطة</h2></div>
    {error && <p role="status" className="mb-2 text-sm">تعذر تحديث المتاجر؛ سنعيد المحاولة تلقائيًا.</p>}
    <BaseMap center={[31.3967, 35.0661]} markers={markers} onMarkerSelect={marker => setSelectedId(marker.id ?? null)} className="h-80 w-full rounded-2xl" />
    {selected && <div className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-surface p-3" role="region" aria-label={selected.nameAr}>
      {selected.logoUrl && <img src={selected.logoUrl} alt="" className="size-14 rounded-lg object-contain" />}
      <div className="min-w-0 flex-1"><h3 className="font-bold">{selected.nameAr}</h3><p className="text-sm text-ink-muted">{selected.storeType ? STORE_TYPE_LABELS[selected.storeType]?.ar : ''}</p><p className="text-xs text-ink-muted">{selected.isAcceptingOrders ? 'يستقبل الطلبات' : 'متوقف عن استقبال الطلبات'}</p></div>
      <Link className="min-h-11 rounded-xl bg-brand px-3 py-3 text-sm font-bold text-white" to={`/stores/${encodeURIComponent(selected.id)}`}>عرض المتجر</Link>
      <button type="button" aria-label="إغلاق تفاصيل المتجر" onClick={() => setSelectedId(null)} className="min-h-11 px-2">×</button>
    </div>}
  </section>;
}
