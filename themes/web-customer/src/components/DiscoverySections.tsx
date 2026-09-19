import { useState } from 'react';
import { AllRestaurantProducts } from './AllRestaurantProducts';
import { useLanguage } from '@samou-go/ui';
import { getNewProducts, useResource } from '@/hooks/useApi';
import type { PopularProduct } from '@samou-go/shared-types';
import { DishCard } from './DishCard';

export function DiscoverySections({ onAdd, featuredProducts = [] }: { onAdd: (product: PopularProduct) => void; featuredProducts?: PopularProduct[] }) {
  const { t } = useLanguage();
  const [showAll, setShowAll] = useState(false);
  const products = useResource('discovery:dishes', signal => getNewProducts(24, signal, true));
  const dishes = products.data ?? [];
  const discounts = [...new Map([...featuredProducts, ...(products.data ?? [])].map(product => [product.id, product])).values()].filter(product => product.isAvailable && product.originalPrice != null && product.originalPrice > product.price);
  return <div id="discovery" className="mx-auto max-w-md px-5 pt-6">
    {discounts.length > 0 && <section className="mb-7" aria-label={t('عروض تستاهل', 'Worth a look')}>
      <div className="mb-3"><p className="text-xs font-bold text-sale">{t('أسعار أخف', 'A little less')}</p><h2 className="mt-1 text-xl font-extrabold">{t('عروض تستاهل', 'Worth a look')}</h2></div>
      <div data-swipe-back="off" tabIndex={0} role="region" aria-label={t('الأطباق المخفضة', 'Discounted dishes')} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 scrollbar-none focus-visible:ring-2 focus-visible:ring-brand">
        {discounts.map(product => <div key={product.id} className="min-w-0 shrink-0 basis-[72%] snap-start"><DishCard product={product} onAdd={onAdd} /></div>)}
      </div>
    </section>}
    <section id="new-products" className="scroll-mt-4">
      <div className="mb-3"><h2 className="text-xl font-extrabold">{t('اكتشف طبقك اليوم', 'Discover your next dish')}</h2><p className="mt-1 text-sm text-ink-muted">{t('نكهات جديدة تستحق التجربة', 'Find a new favourite')}</p></div>
      {products.loading && !products.data && <div className="skeleton h-72 rounded-2xl" aria-label={t('جارٍ التحميل', 'Loading')} />}
      {products.error && <button type="button" onClick={products.refresh} className="min-h-11 text-sm font-bold text-brand">{t('تعذّر تحميل الأطباق — أعد المحاولة', 'Could not load dishes — retry')}</button>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {dishes.slice(0, 20).map(product => <div key={product.id} className="min-w-0"><DishCard product={product} onAdd={onAdd} /></div>)}
      </div>
      <button type="button" onClick={() => setShowAll(value => !value)} aria-expanded={showAll} className="mt-4 min-h-11 w-full rounded-xl border border-line bg-surface px-4 font-bold text-brand">{showAll ? t('إخفاء جميع المنتجات', 'Hide all products') : t('عرض جميع المنتجات', 'View all products')}</button>
      {showAll && <AllRestaurantProducts onAdd={onAdd} />}
    </section>
  </div>;
}
