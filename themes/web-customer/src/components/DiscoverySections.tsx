import { Plus, SlidersHorizontal } from 'lucide-react';
import { StoreHours } from './StoreHours';
import { ProductPhotoFallback } from './ProductPhotoFallback';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
import { getStores, getNewProducts, useResource } from '@/hooks/useApi';
import type { PopularProduct, Store } from '@samou-go/shared-types';
import { formatCurrency } from '@/lib/delivery';

/** Native touch scrolling extends the existing home rails with shared snapping. */
function Reel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      data-swipe-back="off"
      role="region"
      aria-label={label}
      tabIndex={0}
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3 scrollbar-none motion-safe:scroll-smooth"
    >
      {children}
    </div>
  );
}

export function DiscoverySections({ onAdd }: { onAdd: (product: PopularProduct) => void }) {
  const { t } = useLanguage();
  const [active, setActive] = useState('discovery');
  const [visibleCount, setVisibleCount] = useState(8);
  const stores = useResource('discovery:stores', signal =>
    getStores({ sort: 'newest', limit: 24 }, signal)
  );
  const products = useResource('discovery:dishes', signal => getNewProducts(24, signal, true));
  const rated = useResource('discovery:ratings', signal =>
    getStores({ sort: 'rating', limit: 24 }, signal)
  );
  const orderedProducts = useMemo(() => {
    return [...(products.data ?? [])].sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)));
  }, [products.data]);
  const pills = [
    ['discovery', t('الكل', 'All')],
    ['new-stores', t('متاجر جديدة', 'New stores')],
    ['new-products', t('أطباق اليوم', 'Today’s dishes')],
    ['top-rated', t('الأعلى تقييماً', 'Top rated')],
    ['exclusive-offers', t('عروض حصرية', 'Exclusive offers')],
  ];
  const storeCard = (store: Store, rating = false) => (
    <Link
      key={store.id}
      to={`/stores/${encodeURIComponent(store.id)}`}
      className="w-64 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
    >
      <div className="relative h-32 bg-canvas">
        <ImageWithFallback
          src={store.coverUrl ?? store.logoUrl ?? undefined}
          alt={store.nameAr}
          className="h-full w-full object-cover"
          fallbackText={store.nameAr.slice(0, 2)}
        />
        {!rating && (
          <span className="absolute inset-s-3 top-3 rounded-full bg-brand px-2 py-1 text-xs font-bold text-white">
            {store.isRecent ? t('جديد ✨', 'New ✨') : t('من اقتراحاتنا', 'Recommended')}
          </span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <h3 className="truncate font-bold">{store.nameAr}</h3><StoreHours store={store} />
        {rating && store.averageRating != null && (
          <p className="text-sm font-bold text-brand">
            <span dir="ltr">
              ★ {store.averageRating.toFixed(1)} ({store.ratingCount})
            </span>
          </p>
        )}
        <p className="text-xs text-ink-muted">
          {t('يحددها السائق عند الاستلام', 'Determined by the driver on delivery')}
        </p>
      </div>
    </Link>
  );
  return (
    <div id="discovery" className="mx-auto max-w-md scroll-mt-4 px-5 pt-6 font-sans">
      <nav
        aria-label={t('اكتشف المتاجر والمنتجات', 'Discover stores and products')}
        className="mb-5 flex gap-2 overflow-x-auto pb-2 scrollbar-none"
      >
        {pills.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={event => {
              event.preventDefault();
              setActive(id!);
              document
                .getElementById(id!)
                ?.scrollIntoView({
                  behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'instant'
                    : 'smooth',
                  block: 'start',
                });
            }}
            aria-current={active === id ? 'location' : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-bold ${active === id ? 'border-brand bg-brand text-white shadow-brand' : 'border-line bg-surface text-ink-muted'}`}
          >
            {label}
            {id === 'new-stores' && stores.data?.items.some(store => store.isRecent) && (
              <span className="rounded-full bg-brand-tint px-1.5 text-brand-deep">
                {t('جديد', 'New')}
              </span>
            )}
          </a>
        ))}
      </nav>
      {(products.loading || products.error || orderedProducts.length > 0) && <section id="new-products" className="scroll-mt-4 pb-5">
        <div className="mb-4 space-y-1"><h2 className="text-lg font-bold">{t('اكتشف طبقك اليوم', 'Discover your next dish')}</h2><p className="text-sm leading-6 text-ink-muted">{t('وجبة، قهوة أو شيء حلو — اختر ما تشتهيه', 'A meal, coffee or a sweet treat — find your craving')}</p></div>
        <LoadState
          loading={products.loading}
          error={!!products.error}
          empty={!orderedProducts.length}
          retry={products.refresh}
        />
        <div className="grid grid-cols-2 gap-3">
          {orderedProducts.slice(0, visibleCount).map(product => (
            <article
              key={product.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
            >
              <Link to={`/stores/${encodeURIComponent(product.storeId)}?productId=${encodeURIComponent(product.id)}`} aria-label={`عرض ${product.nameAr}`} className="relative block aspect-square overflow-hidden bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
                <ImageWithFallback
                  src={product.imageUrl ?? undefined}
                  fallback={<ProductPhotoFallback />}
                  alt={product.nameAr}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  fallbackText={product.nameAr.slice(0, 2)}
                />
                <span className="absolute inset-s-2 top-2 rounded-full bg-brand px-2 py-1 text-xs font-bold text-white">
                  {product.isRecent
                    ? t('وصل حديثاً', 'Just arrived')
                    : t('من اقتراحاتنا', 'Recommended')}
                </span>
              </Link>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <Link to={`/stores/${encodeURIComponent(product.storeId)}`} className="flex min-h-11 items-center gap-1.5 text-xs text-ink-muted focus-visible:ring-2 focus-visible:ring-brand"><ImageWithFallback src={product.storeLogoUrl ?? undefined} alt="" className="size-6 shrink-0 rounded-full object-contain" fallbackText={product.storeNameAr.slice(0, 1)} /><span className="line-clamp-2">{product.storeNameAr}</span></Link>
                <h3 className="line-clamp-2 min-h-12 text-sm font-bold leading-6"><Link to={`/stores/${encodeURIComponent(product.storeId)}?productId=${encodeURIComponent(product.id)}`} className="focus-visible:ring-2 focus-visible:ring-brand">{product.nameAr}</Link></h3>
                <p dir="ltr" className="mt-auto text-start text-base font-bold text-brand">
                  {formatCurrency(product.price)}
                </p>
                <button
                  type="button"
                  onClick={() => onAdd(product)}
                  disabled={!product.isAvailable}
                  aria-label={`${product.optionsEnabled && product.hasOptions ? t('تخصيص', 'Customize') : t('إضافة', 'Add')} ${product.nameAr}`}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-2 text-sm font-bold text-white hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  {product.optionsEnabled && product.hasOptions ? <SlidersHorizontal size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
                  {product.optionsEnabled && product.hasOptions
                    ? t('تخصيص الطلب', 'Customize')
                    : t('أضف للسلة', 'Add to cart')}
                </button>
              </div>
            </article>
          ))}
        </div>
        {orderedProducts.length > visibleCount && <button type="button" onClick={() => setVisibleCount(count => count + 8)} className="mt-4 min-h-11 w-full rounded-xl border border-brand bg-brand-tint px-4 text-sm font-bold text-brand-deep focus-visible:ring-2 focus-visible:ring-brand">{t('اكتشف المزيد من الأطباق', 'Discover more dishes')}</button>}
      </section>}
      <section id="new-stores" className="scroll-mt-4 pb-5">
        <h2 className="mb-3 text-lg font-bold">{t('متاجر جديدة', 'New stores')}</h2>
        <LoadState
          loading={stores.loading}
          error={!!stores.error}
          empty={!stores.data?.items.length}
          retry={stores.refresh}
        />
        <Reel label={t('متاجر جديدة', 'New stores')}>
          {stores.data?.items.map(store => storeCard(store))}
        </Reel>
      </section>
      <section id="top-rated" className="scroll-mt-4">
        <h2 className="mb-3 text-lg font-bold">{t('الأعلى تقييماً', 'Top rated')}</h2>
        <LoadState
          loading={rated.loading}
          error={!!rated.error}
          empty={!rated.data?.items.length}
          retry={rated.refresh}
        />
        <Reel label={t('الأعلى تقييماً', 'Top rated')}>
          {rated.data?.items.map(store => storeCard(store, true))}
        </Reel>
      </section>
    </div>
  );
}

function LoadState({
  loading,
  error,
  empty,
  retry,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  retry: () => void;
}) {
  const { t } = useLanguage();
  if (loading)
    return (
      <div className="skeleton mb-3 h-48 rounded-2xl" aria-label={t('جارٍ التحميل', 'Loading')} />
    );
  if (error)
    return (
      <button type="button" onClick={retry} className="min-h-11 text-sm text-brand">
        {t('تعذر التحميل — أعد المحاولة', 'Could not load — retry')}
      </button>
    );
  if (empty)
    return (
      <p className="py-4 text-sm text-ink-muted">
        {t('لا توجد نتائج متاحة حالياً', 'No results available yet')}
      </p>
    );
  return null;
}
