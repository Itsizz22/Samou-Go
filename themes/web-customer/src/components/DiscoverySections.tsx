import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
import { getStores, getNewProducts, useResource } from '@/hooks/useApi';
import type { PopularProduct, Store } from '@samou-go/shared-types';
import { formatCurrency } from '@/lib/delivery';

/** Native touch scrolling extends the existing home rails with shared snapping. */
function Reel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
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
  const stores = useResource('discovery:stores', signal =>
    getStores({ sort: 'newest', limit: 12 }, signal)
  );
  const products = useResource('discovery:products', signal => getNewProducts(12, signal));
  const rated = useResource('discovery:ratings', signal =>
    getStores({ sort: 'rating', limit: 12 }, signal)
  );
  const pills = [
    ['discovery', t('الكل', 'All')],
    ['new-stores', t('متاجر جديدة', 'New stores')],
    ['new-products', t('منتجات جديدة', 'New products')],
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
        <h3 className="truncate font-bold">{store.nameAr}</h3>
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
      <section id="new-products" className="scroll-mt-4 pb-5">
        <h2 className="mb-3 text-lg font-bold">{t('منتجات جديدة', 'New products')}</h2>
        <LoadState
          loading={products.loading}
          error={!!products.error}
          empty={!products.data?.length}
          retry={products.refresh}
        />
        <Reel label={t('منتجات جديدة', 'New products')}>
          {products.data?.map(product => (
            <article
              key={product.id}
              className="w-64 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
            >
              <div className="relative aspect-video bg-canvas">
                <ImageWithFallback
                  src={product.imageUrl ?? undefined}
                  alt={product.nameAr}
                  className="h-full w-full object-cover"
                  fallbackText={product.nameAr.slice(0, 2)}
                />
                <span className="absolute inset-s-2 top-2 rounded-full bg-brand px-2 py-1 text-xs font-bold text-white">
                  {product.isRecent
                    ? t('وصل حديثاً', 'Just arrived')
                    : t('من اقتراحاتنا', 'Recommended')}
                </span>
              </div>
              <div className="space-y-2 p-3">
                <p className="truncate text-xs text-ink-muted">{product.storeNameAr}</p>
                <h3 className="truncate font-bold">{product.nameAr}</h3>
                <p dir="ltr" className="text-start text-lg font-bold text-brand">
                  {formatCurrency(product.price)}
                </p>
                <button
                  type="button"
                  onClick={() => onAdd(product)}
                  disabled={!product.isAvailable}
                  className="min-h-11 w-full rounded-xl bg-brand px-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  {product.optionsEnabled && product.hasOptions
                    ? t('تخصيص الطلب', 'Customize')
                    : t('أضف للسلة', 'Add to cart')}
                </button>
              </div>
            </article>
          ))}
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
