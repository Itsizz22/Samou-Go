import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageWithFallback } from '@samou-go/ui';
import { Image as ImageIcon, Store as StoreIcon, Plus, SlidersHorizontal } from 'lucide-react';
import { getStores, searchProducts, useResource } from '@/hooks/useApi';
import type { PopularProduct } from '@samou-go/shared-types';
import { formatCurrency } from '@/lib/delivery';

export function HomeProductSearch({ query, onAdd, contained = false }: { query: string; onAdd: (product: PopularProduct) => void; contained?: boolean }) {
  const [page, setPage] = useState(1);
  const products = useResource(`product-search:${query}:${page}`, signal => searchProducts(query, page, signal));
  const stores = useResource(`store-search:${query}:${page}`, signal => getStores({ search: query, activeOnly: true, page, pageSize: 12 }, signal), { enabled: Boolean(query) });
  const busy = products.loading || products.refreshing || (Boolean(query) && (stores.loading || stores.refreshing));
  const pages = Math.ceil(Math.max(products.data?.total ?? 0, stores.data?.total ?? 0) / 12);
  const items = query ? products.data?.items : products.data?.items.slice(0, 6);
  const storeFallback = <span className="flex h-full w-full items-center justify-center bg-canvas text-ink-muted"><StoreIcon size={20} aria-hidden="true" /></span>;
  return <section id="catalogue-search-results" className={contained ? 'space-y-6 pt-6' : 'mx-auto max-w-md space-y-6 px-5 pt-6'} aria-live="polite" aria-busy={busy}>
    {query && <section aria-labelledby="matching-stores-title">
      <h2 id="matching-stores-title" className="mb-3 text-base font-extrabold">المتاجر المطابقة</h2>
      {stores.error ? <button className="min-h-11 text-brand" onClick={stores.refresh}>تعذّر تحميل المتاجر — إعادة المحاولة</button> : stores.loading || stores.refreshing ? <p role="status">جارٍ البحث…</p> : <>
        <div className="space-y-2">
          {stores.data?.items.map(store => <Link key={store.id} to={`/stores/${encodeURIComponent(store.id)}`} className="flex min-h-20 items-center gap-3 rounded-2xl border border-line bg-surface p-3 focus-visible:ring-2 focus-visible:ring-brand">
            <ImageWithFallback key={store.logoUrl} src={store.logoUrl ?? ''} alt={`شعار ${store.nameAr}`} fallback={storeFallback} className="size-12 shrink-0 rounded-xl object-cover" />
            <span className="min-w-0"><strong className="block text-sm leading-6">{store.nameAr}</strong><span className="text-xs text-ink-muted">عرض المتجر</span></span>
          </Link>)}
        </div>
        {!stores.data?.items.length && <p className="text-sm text-ink-muted">لا توجد متاجر مطابقة في هذه الصفحة</p>}
      </>}
    </section>}
    <section aria-labelledby="matching-products-title">
      <div className="mb-3"><h2 id="matching-products-title" className="text-base font-extrabold">{query ? 'المنتجات المطابقة' : 'اكتشف أطباق مميزة'}</h2>{!query && <p className="mt-1 text-xs text-ink-muted">اقتراحات من المتاجر — اسحب للمزيد</p>}</div>
      {products.error ? <button className="min-h-11 text-brand" onClick={products.refresh}>تعذّر تحميل المنتجات — إعادة المحاولة</button> : products.loading || products.refreshing ? <p role="status">جارٍ تحميل المنتجات…</p> : <>
        <div className={query ? 'space-y-3' : 'flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3'} role={query ? undefined : 'region'} aria-label={query ? undefined : 'اقتراحات المنتجات'} tabIndex={query ? undefined : 0}>
          {items?.map(product => {
            const customize = product.optionsEnabled && product.hasOptions;
            const href = `/stores/${encodeURIComponent(product.storeId)}?productId=${encodeURIComponent(product.id)}`;
            return <article key={product.id} className={`${query ? 'flex gap-3 p-3' : 'w-56 shrink-0 snap-start'} overflow-hidden rounded-2xl border border-line bg-surface shadow-card`}>
              <Link to={href} aria-label={`عرض ${product.nameAr} في ${product.storeNameAr}`} className={`${query ? 'size-24 shrink-0 overflow-hidden rounded-xl' : 'block h-36'} focus-visible:ring-2 focus-visible:ring-brand`}>
                <ImageWithFallback key={product.imageUrl} src={product.imageUrl ?? ''} alt={product.nameAr} className="h-full w-full object-cover" loading="lazy" fallback={<span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-canvas text-ink-muted"><ImageIcon size={26} aria-hidden="true" /><span className="text-xs">الصورة غير متوفرة</span></span>} />
              </Link>
              <div className={`min-w-0 flex-1 space-y-2 ${query ? '' : 'p-3'}`}>
                <Link to={`/stores/${encodeURIComponent(product.storeId)}`} className="flex min-h-11 items-center gap-2 text-xs text-ink-muted focus-visible:ring-2 focus-visible:ring-brand">
                  <ImageWithFallback key={product.storeLogoUrl} src={product.storeLogoUrl ?? ''} alt={`شعار ${product.storeNameAr}`} fallback={storeFallback} className="size-7 shrink-0 rounded-lg object-cover" />
                  <span className="line-clamp-2">{product.storeNameAr}</span>
                </Link>
                <h3 className="text-sm font-bold leading-6"><Link to={href} className="focus-visible:ring-2 focus-visible:ring-brand">{product.nameAr}</Link></h3>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p dir="ltr" className="font-extrabold text-brand">{formatCurrency(product.price)}</p>
                  <button type="button" disabled={!product.isAvailable} onClick={() => onAdd(product)} aria-label={`${customize ? 'تخصيص' : 'إضافة'} ${product.nameAr}`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-xs font-bold text-white hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50">{customize ? <SlidersHorizontal size={15} /> : <Plus size={15} />}{customize ? 'تخصيص' : 'إضافة'}</button>
                </div>
              </div>
            </article>;
          })}
        </div>
        {!items?.length && <p className="text-sm text-ink-muted">{query ? 'لا توجد منتجات مطابقة في هذه الصفحة' : 'لا توجد منتجات متاحة حالياً'}</p>}
      </>}
    </section>
    {query && pages > 1 && <nav aria-label="صفحات نتائج البحث" className="flex items-center justify-between gap-2">
      <button className="min-h-11 rounded-xl border border-line px-4 disabled:opacity-40" disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)}>السابق</button>
      <span dir="ltr">{page} / {pages}</span>
      <button className="min-h-11 rounded-xl border border-line px-4 disabled:opacity-40" disabled={page >= pages || busy} onClick={() => setPage(value => value + 1)}>التالي</button>
    </nav>}
  </section>;
}
