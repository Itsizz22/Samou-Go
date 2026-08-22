/**
 * `/stores/:storeId` — a store's full catalogue with add-to-cart.
 *
 * The single-source catalogue endpoint `GET /stores/:id` returns categories
 * with their products inlined; the screen renders one sticky category bar and
 * a stepper per product. Basket state lives in the shared CartProvider.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowRight, Clock3, FolderOpen, Heart, Loader2, Minus, Plus, RefreshCw, ShoppingCart, Star } from 'lucide-react';
import { useCart } from '@/components/CartProvider';
import { useFavorites } from '@/components/FavoritesProvider';
import { useStore, useOffersForStore } from '@/hooks/useApi';
import { HorizontalScrollGallery, useLanguage } from '@samou-go/ui';
import { ProductRowSkeleton, Skeleton } from '@/components/Skeleton';
import { formatCurrency } from '@/lib/delivery';
import { hapticConfirm, hapticTap } from '@/lib/haptics';
import { PageTransition } from '@/components/PageTransition';

export function StoreDetailScreen() {
  const { storeId = '' } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const store = useStore(storeId);
  const cart = useCart();
  const favorites = useFavorites();
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';

  const handleToggleFavorite = async () => {
    const toggled = await favorites.toggle(storeId);
    if (!toggled) navigate('/favorites');
  };

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const categories = store.data?.categories ?? [];

  const active = useMemo(
    () => activeCategoryId ?? categories[0]?.id ?? null,
    [activeCategoryId, categories]
  );

  const offers = useOffersForStore(storeId);
  const offerProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of offers.data?.items ?? []) {
      for (const pid of o.productIds) ids.add(pid);
    }
    return ids;
  }, [offers.data]);

  if (store.loading && !store.data) {
    return (
      <PageTransition>
        <main className="min-h-screen bg-canvas pb-24 text-ink">
          <div className="safe-top bg-brand px-5 pb-5 pt-4 text-white">
            <div className="mx-auto max-w-md">
              <Skeleton className="h-4 w-24 bg-white/30" />
              <Skeleton className="mt-2 h-6 w-40 bg-white/30" />
            </div>
          </div>
          <div className="mx-auto max-w-md space-y-3 px-5 pt-6">
            {[0, 1, 2, 3, 4].map((index) => (
              <ProductRowSkeleton key={index} />
            ))}
          </div>
        </main>
      </PageTransition>
    );
  }

  if (store.error && !store.data) {
    return (
      <PageTransition>
        <main className="min-h-screen bg-canvas pb-24 text-ink">
          <div className="mx-auto max-w-md px-5 pt-16 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
              <AlertTriangle size={22} />
            </span>
            <h1 className="mt-4 text-sm font-extrabold">تعذّر تحميل المتجر <span dir="ltr">/ Failed to load store</span></h1>
            <p className="mt-1 text-xs text-ink-soft">{store.error.message}</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={store.refresh}
                disabled={store.refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
              >
                {store.refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-xs font-bold text-ink-soft transition hover:border-brand hover:bg-brand-surface hover:text-brand-deep active:scale-95"
              >
                <ArrowRight size={14} className="rtl:rotate-180" /> رجوع
              </button>
            </div>
          </div>
        </main>
      </PageTransition>
    );
  }

  const current = store.data!;
  const products = active
    ? categories.find((category) => category.id === active)?.products ?? []
    : [];

  const handleAdd = (productId: string, product: (typeof products)[number]) => {
    const line = cart.lineFor(productId);
    if (line) {
      cart.setQuantity(productId, line.quantity + 1);
      void hapticConfirm();
      return;
    }
    cart.addItem(product, 1, '', current.nameAr);
    void hapticConfirm();
  };

  return (
    <PageTransition>
      <main className="min-h-screen bg-canvas pb-28 text-ink">
        <header className="safe-top bg-brand px-5 pb-4 pt-4 text-white">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <button
              type="button"
              aria-label={t('رجوع', 'Back')}
              onClick={() => navigate(-1)}
              className="rounded-full p-2 transition hover:bg-surface/15 active:scale-95"
            >
              <ArrowRight size={22} className="rtl:rotate-180" />
            </button>
            <div className="min-w-0 flex-1 text-end">
              <h1 className="truncate text-lg font-extrabold">{t(current.nameAr, current.nameEn)}</h1>
              {current.isRecommended && (
                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-micro font-bold text-white">
                  <Star size={10} fill="currentColor" />
                  {t('موصى به لدينا', 'Recommended by us')}
                </span>
              )}
              <p className="truncate text-[11px] text-white/80" dir="ltr">
                {current.phone}
              </p>
            </div>
            <button
              type="button"
              aria-label={
                favorites.isFavorite(storeId) ? t('إزالة من المفضلة', 'Remove from favorites') : t('إضافة إلى المفضلة', 'Add to favorites')
              }
              aria-pressed={favorites.isFavorite(storeId)}
              onClick={() => void handleToggleFavorite()}
              disabled={favorites.pending.includes(storeId)}
              className="rounded-full p-2 text-white transition hover:bg-surface/15 active:scale-95 disabled:opacity-60"
            >
              <Heart size={20} fill={favorites.isFavorite(storeId) ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              aria-label={`السلة (${cart.itemCount})`}
              onClick={() => navigate('/cart')}
              className="relative rounded-full p-2 transition hover:bg-surface/15 active:scale-95"
            >
              <ShoppingCart size={20} />
              <AnimatePresence>
                {cart.itemCount > 0 && (
                  <motion.span
                    key={cart.itemCount}
                    initial={{ scale: 0.4 }}
                    animate={{ scale: [0.4, 1.15, 0.92, 1] }}
                    transition={{ duration: 0.45 }}
                    className="absolute -top-0.5 -end-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-micro font-bold text-white"
                  >
                    {cart.itemCount > 99 ? '99+' : cart.itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </header>

        {/* Store closed banner — shown when the manager toggled "accepting orders" off */}
        {!current.isAcceptingOrders && (
          <div className="mx-auto max-w-md px-5 pt-4">
            <div className="flex items-center gap-3 rounded-2xl border border-warning bg-warning-tint px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning text-white">
                <Clock3 size={18} />
              </span>
              <div className="flex-1 text-end">
                <p className="text-xs font-extrabold text-warning-dark">
                  {t('المتجر مغلق حالياً', 'Store is currently closed')}
                </p>
                {current.openingTime && current.closingTime && (
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {t(`يفتح الساعة ${current.openingTime} ويسغل ${current.closingTime}`, `Opens at ${current.openingTime}, closes at ${current.closingTime}`)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cover banner — uploaded by the store manager (uploads pipeline,
            `store` kind with `cover` purpose); falls back to no banner. */}
        {current.coverUrl && (
          <div className="mx-auto max-w-md px-5 pt-4">
            <img
              src={current.coverUrl}
              alt={t(current.nameAr, current.nameEn)}
              loading="lazy"
              className="h-32 w-full rounded-2xl object-cover shadow-card"
            />
          </div>
        )}

        {/* Quick-browse rail — horizontal scrollable categories.
            Constrained to the app's standard `max-w-md` column like every
            other section on the page, so the title, chips and arrows stay
            visually connected at any viewport width. */}
        <HorizontalScrollGallery
          titleAr={t('فئات المتجر', 'Categories')}
          titleEn={t('فئات المتجر', 'Categories')}
          ariaLabel={t('فئات المتجر', 'Categories')}
          className="mx-auto w-full max-w-md px-5 pt-5"
          trackClassName="gap-2"
          showArrows={categories.length > 1}
        >
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                setActiveCategoryId(category.id);
                void hapticTap();
              }}
              aria-pressed={category.id === active}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                category.id === active ? 'bg-brand text-white' : 'bg-canvas text-ink-muted'
              }`}
            >
              {category.imageUrl ? (
                <img
                  src={category.imageUrl}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-md object-cover"
                  loading="lazy"
                />
              ) : (
                <FolderOpen size={14} className="shrink-0" />
              )}
              {t(category.nameAr, category.nameEn)}
            </button>
          ))}
        </HorizontalScrollGallery>

        {/* Active offers banner */}
        {(() => {
          const activeOffers = (offers.data?.items ?? []).filter(o => o.imageUrl);
          if (activeOffers.length === 0) return null;
          return (
            <div className="mx-auto w-full max-w-md px-5 pt-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {activeOffers.slice(0, 3).map(o => (
                  <div
                    key={o.id}
                    className="shrink-0 overflow-hidden rounded-xl border border-line bg-surface shadow-card"
                  >
                    <img
                      src={o.imageUrl!}
                      alt={t(o.titleAr, o.titleEn)}
                      className="h-20 w-36 object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="mx-auto max-w-md px-5 pt-5">
          {products.length === 0 ? (
            <p className="py-12 text-center text-xs text-ink-muted">
              لا توجد منتجات في هذه الفئة حالياً
            </p>
          ) : (
            <div className="space-y-3">
              {products
                .filter((product) => product.isAvailable)
                .map((product, index) => {
                  const line = cart.lineFor(product.id);
                  return (
                    <motion.article
                      key={product.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.04, 0.4) }}
                      className="relative flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card"
                    >
                      {/* Offer badge */}
                      {offerProductIds.has(product.id) && (
                        <span className="absolute -top-1.5 -end-1.5 z-10 rounded-full bg-brand px-2 py-0.5 text-micro font-bold text-white shadow-sm">
                          {t('عرض', 'Offer')}
                        </span>
                      )}
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-lg font-black text-brand-dark">
                          {product.nameAr.slice(0, 2)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1 text-end">
                        <h3 className="truncate text-sm font-extrabold">{product.nameAr}</h3>
                        {product.description && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted">
                            {product.description}
                          </p>
                        )}
                        <p className="mt-1 text-sm font-bold text-brand-dark" dir="ltr">
                          {formatCurrency(product.price)}
                        </p>
                      </div>
                      {line ? (
                        <div className="flex shrink-0 items-center gap-2 rounded-full bg-brand px-1.5 py-1 text-white">
                          <button
                            type="button"
                            aria-label={t('إنقاص', 'Decrease')}
                            onClick={() => {
                              cart.setQuantity(product.id, line.quantity - 1);
                              void hapticTap();
                            }}
                            className="rounded-full p-2 transition active:scale-90"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="min-w-[18px] text-center text-xs font-bold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={t('زيادة', 'Increase')}
                            onClick={() => {
                              cart.setQuantity(product.id, line.quantity + 1);
                              void hapticTap();
                            }}
                            className="rounded-full p-2 transition active:scale-90"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label={`أضف ${product.nameAr} إلى السلة`}
                          onClick={() => handleAdd(product.id, product)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-dark transition active:scale-90"
                        >
                          <Plus size={18} strokeWidth={2.5} />
                        </button>
                      )}
                    </motion.article>
                  );
                })}
            </div>
          )}
        </div>

        <AnimatePresence>
          {cart.itemCount > 0 && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="fixed inset-x-0 bottom-16 z-20 px-5"
            >
              <button
                type="button"
                onClick={() => navigate('/cart')}
                className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-brand px-5 py-3.5 text-white shadow-brand transition active:scale-[0.98]"
              >
                <span className="flex items-center gap-2 text-sm font-extrabold">
                  <ShoppingCart size={17} /> {t('عرض السلة', 'View cart')}
                </span>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">
                  {cart.itemCount} · {formatCurrency(cart.subtotal)}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </PageTransition>
  );
}
