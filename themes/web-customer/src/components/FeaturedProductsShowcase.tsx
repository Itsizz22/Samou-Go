import { ProductPhotoFallback } from './ProductPhotoFallback';
import { Link } from 'react-router-dom';
import { Pause, Play, Plus, SlidersHorizontal, Store } from 'lucide-react';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
import type { PopularProduct } from '@samou-go/shared-types';
import { useShowcaseCarousel } from '@/hooks/useShowcaseCarousel';
import { formatCurrency } from '@/lib/delivery';

interface Props {
  products: PopularProduct[];
  loading: boolean;
  onAdd: (product: PopularProduct) => void;
}

export function FeaturedProductsShowcase({ products, loading, onAdd }: Props) {
  const { t, dir } = useLanguage();
  const carousel = useShowcaseCarousel(products.length);
  if (!products.length && !loading) return null;
  return (
    <section
      className="mx-auto max-w-md px-5 pt-5 font-sans"
      aria-label={t('منتجات مميزة اخترناها لك', 'Featured products picked for you')}
      aria-busy={loading}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">
            {t('منتجات مميزة اخترناها لك', 'Featured products picked for you')}
          </h2>
          <p className="text-xs text-ink-muted">
            {t('اختيارات مميزة من متاجرنا', 'Handpicked dishes from our stores')}
          </p>
        </div>
        {products.length > 1 && (
          <button
            type="button"
            onClick={() => carousel.setStopped(!carousel.stopped)}
            aria-label={t(
              carousel.stopped ? 'تشغيل العرض التلقائي' : 'إيقاف العرض التلقائي',
              carousel.stopped ? 'Start slideshow' : 'Pause slideshow'
            )}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted"
          >
            {carousel.stopped ? <Play size={17} /> : <Pause size={17} />}
          </button>
        )}
      </div>
      {loading && !products.length ? (
        <div className="skeleton h-80 rounded-3xl" aria-hidden="true" />
      ) : (
        <>
          <div
            {...carousel.bindings}
            className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card"
            style={{ touchAction: 'pan-y' }}
          >
            {/* Track order is physical LTR; content remains RTL. Next moves right-to-left. */}
            <div dir="ltr" className="flex" style={carousel.trackStyle}>
              {products.map((product, index) => (
                <article
                  key={product.id}
                  dir={dir}
                  inert={index !== carousel.active}
                  aria-hidden={index !== carousel.active}
                  className="group relative w-full min-w-0 shrink-0 basis-full"
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
                    <p className="line-clamp-2 min-h-10 text-xs leading-5 text-ink-muted">
                      {product.description}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span dir="ltr" className="text-lg font-extrabold text-brand">
                        {formatCurrency(product.price)}
                      </span>
                      <button
                        type="button"
                        disabled={!product.isAvailable}
                        onClick={() => onAdd(product)}
                        className="relative z-20 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
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
              {...carousel.bindings}
              dir={dir}
              className="flex flex-wrap items-center justify-center"
              aria-label={t('اختيار المنتج', 'Choose product')}
            >
              {products.map((product, index) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => carousel.setIndex(index)}
                  aria-label={t(`عرض ${product.nameAr}`, `Show ${product.nameAr}`)}
                  aria-pressed={index === carousel.active}
                  className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${index === carousel.active ? 'w-6 bg-brand' : 'w-1.5 bg-brand-tint'}`}
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
