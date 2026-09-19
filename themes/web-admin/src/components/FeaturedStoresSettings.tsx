import { useState } from 'react';
import { getStores, setStoreRecommended, useResource } from '@samou-go/api-client';
import { ImageWithFallback } from '@samou-go/ui';

export function FeaturedStoresSettings() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const stores = useResource(`featured-stores:${page}:${query}`, signal => getStores({ page, pageSize: 20, activeOnly: false, ...(query.trim() ? { search: query.trim() } : {}) }, signal, true));
  return <section className="space-y-4 rounded-2xl border border-line bg-surface p-5" aria-label="المتاجر المميزة">
    <h3 className="font-bold">المتاجر المميزة</h3>
    <p className="text-sm text-ink-muted">فعّل تمييز المتجر ليظهر فوق الأطباق المميزة في الرئيسية. يعتمد على علامة التوصية نفسها في إدارة المتاجر، وتظهر المتاجر المتاحة فقط للزبون.</p>
    <label className="block text-sm">ابحث عن متجر<input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3" /></label>
    {stores.error && <button onClick={stores.refresh} className="min-h-11 text-brand">تعذر التحميل — أعد المحاولة</button>}
    {stores.loading || stores.refreshing ? <p role="status">جارٍ التحميل…</p> : <div className="grid gap-3 sm:grid-cols-2">{stores.data?.items.map(store => <label key={store.id} className="flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border border-line p-3">
      <ImageWithFallback src={store.logoUrl ?? undefined} alt="" className="size-12 rounded-xl object-contain" fallbackText={store.nameAr.slice(0, 1)} />
      <span className="flex-1 text-sm font-bold">{store.nameAr}{(!store.isActive || !store.isApproved) && <small className="block text-ink-muted">غير ظاهر للزبون حاليًا</small>}</span>
      <input type="checkbox" checked={Boolean(store.isRecommended)} disabled={pending !== null} onChange={async event => {
        const checked = event.target.checked;
        setPending(store.id); setMessage('');
        try { await setStoreRecommended(store.id, checked); stores.refresh(); setMessage('تم حفظ تمييز المتجر.'); }
        catch { setMessage('تعذر الحفظ؛ حاول مجددًا.'); }
        finally { setPending(null); }
      }} className="size-5 accent-brand" />
    </label>)}</div>}
    <div className="flex items-center justify-between"><button className="min-h-11 px-3 disabled:opacity-40" disabled={page === 1 || stores.loading || stores.refreshing} onClick={() => setPage(value => value - 1)}>السابق</button><span dir="ltr">{page} / {Math.max(1, Math.ceil((stores.data?.total ?? 0) / 20))}</span><button className="min-h-11 px-3 disabled:opacity-40" disabled={page * 20 >= (stores.data?.total ?? 0) || stores.loading || stores.refreshing} onClick={() => setPage(value => value + 1)}>التالي</button></div>
    <p role="status" className="text-sm">{message}</p>
  </section>;
}
