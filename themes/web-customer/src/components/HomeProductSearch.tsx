import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageWithFallback } from '@samou-go/ui';
import { getStores, searchProducts, useResource } from '@/hooks/useApi';
import type { PopularProduct } from '@samou-go/shared-types';
import { formatCurrency } from '@/lib/delivery';

export function HomeProductSearch({ query, onAdd }: { query: string; onAdd: (product: PopularProduct) => void }) {
  const [page, setPage] = useState(1);
  const products = useResource(`product-search:${query}:${page}`, signal => searchProducts(query, page, signal));
  const stores = useResource(`store-search:${query}:${page}`, signal => getStores({ search: query, page, pageSize: 12 }, signal), { enabled: Boolean(query) });
  const busy = products.loading || products.refreshing;
  const pages = Math.ceil(Math.max(products.data?.total ?? 0, stores.data?.total ?? 0) / 12);
  return <section id="catalogue-search-results" className="mx-auto max-w-md space-y-5 px-5 pt-6" aria-live="polite" aria-busy={busy}>
    {query && <section aria-labelledby="matching-stores-title">
      <h2 id="matching-stores-title" className="mb-3 text-lg font-extrabold">المتاجر المطابقة</h2>
      {stores.error ? <button className="min-h-11 text-brand" onClick={stores.refresh}>تعذّر تحميل المتاجر — إعادة المحاولة</button> : stores.loading || stores.refreshing ? <p role="status">جارٍ البحث…</p> : <>
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2" tabIndex={0} role="region" aria-label="المتاجر المطابقة">
          {stores.data?.items.map(store => <Link key={store.id} to={`/stores/${encodeURIComponent(store.id)}`} className="flex min-h-14 w-48 shrink-0 snap-start items-center gap-2 rounded-2xl border border-line bg-surface p-3 focus-visible:ring-2 focus-visible:ring-brand">
            <ImageWithFallback src={store.logoUrl ?? ''} alt="" fallbackText={store.nameAr.slice(0, 2)} className="h-10 w-10 shrink-0 rounded-xl object-cover" />
            <span className="text-sm font-bold">{store.nameAr}</span>
          </Link>)}
        </div>
        {!stores.data?.items.length && <p className="text-sm text-ink-muted">لا توجد متاجر مطابقة في هذه الصفحة</p>}
      </>}
    </section>}
    <section aria-labelledby="matching-products-title">
      <h2 id="matching-products-title" className="mb-3 text-lg font-extrabold">{query ? 'المنتجات المطابقة' : 'اكتشف أطباق مميزة'}</h2>
      {products.error ? <button className="min-h-11 text-brand" onClick={products.refresh}>تعذّر تحميل المنتجات — إعادة المحاولة</button> : busy ? <p role="status">جارٍ تحميل المنتجات…</p> : <>
        <div className="grid grid-cols-2 gap-3">
          {products.data?.items.map(product => <article key={product.id} className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <ImageWithFallback src={product.imageUrl ?? ''} alt={product.nameAr} className="aspect-square w-full object-cover" loading="lazy" />
            <div className="space-y-2 p-3">
              <Link to={`/stores/${encodeURIComponent(product.storeId)}`} className="flex min-h-11 items-center text-xs text-ink-muted focus-visible:ring-2 focus-visible:ring-brand">{product.storeNameAr}</Link>
              <h3 className="text-sm font-bold">{product.nameAr}</h3>
              <p dir="ltr" className="text-start font-bold text-brand">{formatCurrency(product.price)}</p>
              <button type="button" onClick={() => onAdd(product)} aria-label={`${product.optionsEnabled && product.hasOptions ? 'تخصيص' : 'إضافة'} ${product.nameAr}`} className="min-h-11 w-full rounded-xl bg-brand px-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{product.optionsEnabled && product.hasOptions ? 'تخصيص' : '+ إضافة'}</button>
            </div>
          </article>)}
        </div>
        {!products.data?.items.length && <p className="text-sm text-ink-muted">{query ? 'لا توجد منتجات مطابقة في هذه الصفحة' : 'لا توجد منتجات متاحة حالياً'}</p>}
      </>}
    </section>
    {query && pages > 1 && <nav aria-label="صفحات نتائج البحث" className="flex items-center justify-between gap-2">
      <button className="min-h-11 rounded-xl border border-line px-4 disabled:opacity-40" disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)}>السابق</button>
      <span dir="ltr">{page} / {pages}</span>
      <button className="min-h-11 rounded-xl border border-line px-4 disabled:opacity-40" disabled={page >= pages || busy} onClick={() => setPage(value => value + 1)}>التالي</button>
    </nav>}
  </section>;
}
