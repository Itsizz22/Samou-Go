import { ProductPhotoFallback } from './ProductPhotoFallback';
import { Link } from 'react-router-dom';
import { Pause, Play, Plus, SlidersHorizontal, Store } from 'lucide-react';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
import type { PopularProduct } from '@samou-go/shared-types';
import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/delivery';

interface Props {
  products: PopularProduct[];
  loading: boolean;
  onAdd: (product: PopularProduct) => void;
}

export function FeaturedProductsShowcase({ products, loading, onAdd }: Props) {
  const { t, dir } = useLanguage();
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [stopped, setStopped] = useState(false);
  const interacting = useRef(false);
  const moveTo = (index: number) => {
    const element = track.current;
    if (!element) return;
    element.scrollTo({ left: (dir === 'rtl' ? -1 : 1) * index * element.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  useEffect(() => {
    if (stopped || products.length < 2) return;
    const timer = window.setInterval(() => {
      if (!interacting.current && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        moveTo((Math.round(Math.abs(track.current?.scrollLeft ?? 0) / (track.current?.clientWidth || 1)) + 1) % products.length);
      }
    }, 4500);
    return () => window.clearInterval(timer);
  }, [stopped, products.length, dir]);
  if (!products.length && !loading) return null;
  return (
    <section
      className="mx-auto max-w-md px-5 pt-5 font-sans"
      aria-label={t('أطباق مميزة اخترناها لك', 'Featured dishes picked for you')}
      aria-busy={loading}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">
            {t('أطباق مميزة اخترناها لك', 'Featured dishes picked for you')}
          </h2>
          <p className="text-xs text-ink-muted">
            {t('من المطاعم والمقاهي والحلويات والمخابز', 'Restaurants, cafés, bakeries and sweets')}
          </p>
        </div>
        {products.length > 1 && (
          <button
            type="button"
            onClick={() => setStopped(!stopped)}
            aria-label={t(
              stopped ? 'تشغيل العرض التلقائي' : 'إيقاف العرض التلقائي',
              stopped ? 'Start slideshow' : 'Pause slideshow'
            )}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-muted focus-visible:ring-2 focus-visible:ring-brand"
          >
            {stopped ? <Play size={17} /> : <Pause size={17} />}
          </button>
        )}
      </div>
      {loading && !products.length ? (
        <div className="skeleton h-80 rounded-3xl" aria-hidden="true" />
      ) : (
        <>
          <div
            data-swipe-back="off"
            className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card"

          >
            {/* Native scrolling follows the reading direction, including rightward swipes in Arabic. */}
            <div ref={track} dir={dir} className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none"
              onScroll={event => setActive(Math.round(Math.abs(event.currentTarget.scrollLeft) / (event.currentTarget.clientWidth || 1)))}
              onPointerDown={() => { interacting.current = true; setStopped(true); }}
              onPointerUp={() => { interacting.current = false; }}
              onPointerCancel={() => { interacting.current = false; }}
              onMouseEnter={() => { interacting.current = true; }}
              onMouseLeave={() => { interacting.current = false; }}
            >
              {products.map((product, index) => (
                <article
                  key={`${product.id}-${index}`}
                  dir={dir}
                  className="group relative w-full min-w-0 shrink-0 basis-full snap-center snap-always"
                >
                  <Link draggable={false}
                    to={`/stores/${encodeURIComponent(product.storeId)}?productId=${encodeURIComponent(product.id)}`}
                    aria-label={t(`عرض ${product.nameAr} في ${product.storeNameAr}`, `View ${product.nameAr} at ${product.storeNameAr}`)}
                    className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand"
                  />
                  <div className="relative aspect-video overflow-hidden bg-canvas">
                    <ImageWithFallback
                      src={product.imageUrl ?? undefined}
                  fallback={<ProductPhotoFallback />}
                      alt={product.nameAr}
                      className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105 motion-reduce:transition-none"
                      fallbackText={product.nameAr.slice(0, 2)}
                    />
                    <div className="absolute inset-s-3 bottom-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-line bg-surface px-2 py-1 text-xs shadow-card">
                      {product.storeLogoUrl ? (
                        <ImageWithFallback
                          src={product.storeLogoUrl}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded-full object-contain"
                        />
                      ) : (
                        <Store size={18} className="text-brand" />
                      )}
                      <span className="line-clamp-1 pe-1 font-semibold">{product.storeNameAr}</span>
                    </div>
                  </div>
                  <div className="space-y-2 p-4">
                    <h3 className="line-clamp-2 min-h-6 text-base font-bold">{product.nameAr}</h3>
                    {product.description && <p className="line-clamp-2 text-sm leading-6 text-ink-muted">
                      {product.description}
                    </p>}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span dir="ltr" className="text-lg font-extrabold text-brand">
                        {formatCurrency(product.price)}
                      </span>
                      <button
                        type="button"
                        disabled={!product.isAvailable}
                        onClick={() => onAdd(product)}
                        className="relative z-20 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        {product.optionsEnabled && product.hasOptions ? (
                          <SlidersHorizontal size={17} />
                        ) : (
                          <Plus size={17} />
                        )}
                        {t(
                          product.optionsEnabled && product.hasOptions
                            ? 'تخصيص الطلب'
                            : 'أضف للسلة',
                          product.optionsEnabled && product.hasOptions ? 'Customize' : 'Add to cart'
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
          {products.length > 1 && (
            <div
              data-swipe-back="off"
              dir={dir}
              className="flex items-center justify-center"
              aria-label={t('اختيار المنتج', 'Choose product')}
            >
              {products.map((product, index) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => moveTo(index)}
                  aria-label={t(`عرض ${product.nameAr}`, `Show ${product.nameAr}`)}
                  aria-pressed={index === active}
                  className="flex h-11 min-w-0 max-w-11 flex-1 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${index === active ? 'w-6 bg-brand' : 'w-1.5 bg-brand-tint'}`}
                  />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
