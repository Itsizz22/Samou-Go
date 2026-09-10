import { useLanguage } from '@samou-go/ui';
import { getNewProducts, useResource } from '@/hooks/useApi';
import type { PopularProduct } from '@samou-go/shared-types';
import { DishCard } from './DishCard';

export function DiscoverySections({ onAdd, featuredProducts = [] }: { onAdd: (product: PopularProduct) => void; featuredProducts?: PopularProduct[] }) {
  const { t } = useLanguage();
  const products = useResource('discovery:dishes', signal => getNewProducts(24, signal, true));
  const featuredIds = new Set(featuredProducts.map(product => product.id));
  const dishes = (products.data ?? []).filter(product => !featuredIds.has(product.id));
  const discounts = [...new Map([...featuredProducts, ...(products.data ?? [])].map(product => [product.id, product])).values()].filter(product => product.isAvailable && product.originalPrice != null && product.originalPrice > product.price);
  return <div id="discovery" className="mx-auto max-w-md px-5 pt-6">
    {discounts.length > 0 && <section className="mb-7" aria-label={t('عروض تستاهل', 'Worth a look')}>
      <div className="mb-3"><p className="text-xs font-bold text-sale">{t('أسعار أخف', 'A little less')}</p><h2 className="mt-1 text-xl font-extrabold">{t('عروض تستاهل', 'Worth a look')}</h2></div>
      <div data-swipe-back="off" tabIndex={0} role="region" aria-label={t('الأطباق المخفضة', 'Discounted dishes')} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 scrollbar-none focus-visible:ring-2 focus-visible:ring-brand">
        {discounts.map(product => <div key={product.id} className="min-w-0 shrink-0 basis-[72%] snap-start"><DishCard product={product} onAdd={onAdd} /></div>)}
      </div>
    </section>}
    {(products.loading || products.error || dishes.length > 0) && <section id="new-products" className="scroll-mt-4">
      <div className="mb-3"><h2 className="text-xl font-extrabold">{t('اكتشف طبقك اليوم', 'Discover your next dish')}</h2><p className="mt-1 text-sm text-ink-muted">{t('نكهات جديدة تستحق التجربة', 'Find a new favourite')}</p></div>
      {products.loading && !products.data && <div className="skeleton h-72 rounded-2xl" aria-label={t('جارٍ التحميل', 'Loading')} />}
      {products.error && <button type="button" onClick={products.refresh} className="min-h-11 text-sm font-bold text-brand">{t('تعذّر تحميل الأطباق — أعد المحاولة', 'Could not load dishes — retry')}</button>}
      <div data-swipe-back="off" tabIndex={0} role="region" aria-label={t('اسحب لاكتشاف الأطباق', 'Swipe to discover dishes')} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 scrollbar-none focus-visible:ring-2 focus-visible:ring-brand">
        {dishes.map(product => <div key={product.id} className="min-w-0 shrink-0 basis-[72%] snap-start"><DishCard product={product} onAdd={onAdd} /></div>)}
      </div>
      {dishes.length > 1 && <p className="mt-1 text-xs text-ink-muted">{t('اسحب واختر ما تشتهيه', 'Swipe and find your craving')}</p>}
    </section>}
  </div>;
}
