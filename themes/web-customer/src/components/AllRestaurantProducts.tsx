import { useState } from 'react';
import { searchProducts, useResource } from '@/hooks/useApi';
import { useLanguage } from '@samou-go/ui';
import type { PopularProduct } from '@samou-go/shared-types';
import { DishCard } from './DishCard';

export function AllRestaurantProducts({ onAdd }: { onAdd: (product: PopularProduct) => void }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [shuffleSeed] = useState(() => crypto.randomUUID());
  const products = useResource(`all-restaurant-products:${shuffleSeed}:${page}`, signal => searchProducts('', page, signal, false, 'all', { foodStoresOnly: true, shuffleSeed }));
  const busy = products.loading || products.refreshing;
  return <section className="mt-5 space-y-4" aria-label={t('جميع المنتجات', 'All products')} aria-busy={busy}>
    <p className="text-sm text-ink-muted">{t('جميع المنتجات المتاحة من المطاعم والمقاهي والمخابز والحلويات', 'All available products from restaurants, cafes and bakeries')}</p>
    {products.error ? <button className="min-h-11 text-brand" onClick={products.refresh}>{t('تعذر التحميل — أعد المحاولة', 'Unable to load — retry')}</button> : busy ? <p role="status">{t('جارٍ تحميل المنتجات…', 'Loading products…')}</p> : <>
      <div className="sq-dish-grid grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{products.data?.items.map(product => <DishCard key={product.id} product={product} onAdd={onAdd} />)}</div>
      {!products.data?.items.length && <p>{t('لا توجد منتجات متاحة حاليًا', 'No products currently available')}</p>}
    </>}
    <nav aria-label={t('صفحات المنتجات', 'Product pages')} className="flex items-center justify-between gap-3">
      <button className="min-h-11 rounded-xl border border-line px-4 disabled:opacity-40" disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)}>{t('السابق', 'Previous')}</button>
      <span dir="ltr">{page} / {Math.max(1, Math.ceil((products.data?.total ?? 0) / 12))}</span>
      <button className="min-h-11 rounded-xl border border-line px-4 disabled:opacity-40" disabled={page * 12 >= (products.data?.total ?? 0) || busy} onClick={() => setPage(value => value + 1)}>{t('التالي', 'Next')}</button>
    </nav>
  </section>;
}
