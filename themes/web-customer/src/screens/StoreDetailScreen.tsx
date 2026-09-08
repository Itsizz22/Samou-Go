import { normalizeOptionGroups, resolveSelectedOptions } from '@samou-go/shared-types';
/**
 * `/stores/:storeId` — a store's full catalogue with add-to-cart.
 *
 * The single-source catalogue endpoint `GET /stores/:id` returns categories
 * with their products inlined; the screen renders one sticky category bar and
 * a stepper per product. Basket state lives in the shared CartProvider.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, AlertTriangle, ArrowRight, Clock3, FolderOpen, Heart, Loader2, MessageCircle, Minus, Plus, RefreshCw, ShoppingCart, Star, Store } from 'lucide-react';
import { useCart } from '@/components/CartProvider';
import { useFavorites } from '@/components/FavoritesProvider';
import { useStore, useOffersForStore } from '@/hooks/useApi';
import { HorizontalScrollGallery, ImageWithFallback, useLanguage } from '@samou-go/ui';
import { ProductRowSkeleton, Skeleton } from '@/components/Skeleton';
import { formatCurrency } from '@/lib/delivery';
import { StoreStatus, STORE_STATUS_LABELS, formatWhatsAppLink } from '@samou-go/shared-types';
import { hapticConfirm, hapticTap } from '@/lib/haptics';
import { PageTransition } from '@/components/PageTransition';
import { ProductOptionsSheet } from '@/components/ProductOptionsSheet';

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

  const [menuSearch, setMenuSearch] = useState('');
  const query = menuSearch.trim().toLocaleLowerCase();
  const categories = useMemo(() => (store.data?.categories ?? []).map(category => ({
    ...category,
    products: category.products.filter(product => product.isAvailable && (!query || product.nameAr.toLocaleLowerCase().includes(query))),
  })).filter(category => !query || category.products.length > 0), [store.data, query]);

  const active = useMemo(
    () => categories.some(category => category.id === activeCategoryId) ? activeCategoryId : categories[0]?.id ?? null,
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

  const current = store.data!;
  const products = query ? categories.flatMap(category => category.products) : active
    ? categories.find((category) => category.id === active)?.products ?? []
    : [];

  // Product that is currently showing the options sheet.
  const [optionsProduct, setOptionsProduct] = useState<(typeof products)[number] | null>(null);

  const handleAdd = useCallback((productId: string, product: (typeof products)[number]) => {
    // If the product has option groups, open the options sheet instead.
    if (normalizeOptionGroups(product.optionGroups).length > 0) {
      setOptionsProduct(product);
      return;
    }
    const line = cart.lineFor(productId);
    if (line) {
      cart.setQuantity(productId, line.quantity + 1);
      void hapticConfirm();
      return;
    }
    cart.addItem(product, 1, '', current.nameAr);
    void hapticConfirm();
  }, [cart, current?.nameAr]);

  const handleOptionsConfirm = useCallback((options: { groupId: string; optionId: string }[], quantity: number) => {
    if (!optionsProduct) return;
    // Map option IDs to SelectedOption objects.
    const selectedOptions = resolveSelectedOptions(optionsProduct.optionGroups, options);
    cart.addItem(optionsProduct, quantity, '', current.nameAr, selectedOptions);
    setOptionsProduct(null);
    void hapticConfirm();
  }, [optionsProduct, cart, current?.nameAr]);

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

  if (!current) return null;

  return (
    <PageTransition>
      <main className="sq-store-menu min-h-screen bg-canvas pb-28 font-sans text-ink">
        <header className="safe-top relative isolate min-h-52 overflow-hidden bg-brand-deep px-5 pb-5 pt-4 text-white">
          {current.coverUrl && <img src={current.coverUrl} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />}
          <div className="absolute inset-0 -z-10 bg-linear-to-t from-brand-deep via-brand-deep/70 to-brand-deep/30" />
          <div className="mx-auto grid min-h-40 max-w-md grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-start gap-3">
            <button
              type="button"
              aria-label={t('رجوع', 'Back')}
              onClick={() => navigate(-1)}
              className="rounded-full p-2 transition hover:bg-surface/15 active:scale-95"
            >
              <ArrowRight size={22} className="rtl:rotate-180" />
            </button>
            <div className="order-last col-span-3 min-w-0 self-end text-start">
              <h1 className="text-lg font-extrabold">{t(current.nameAr, current.nameEn)}</h1>
              {current.isRecommended && (
                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-micro font-bold text-white">
                  <Star size={10} fill="currentColor" />
                  {t('موصى به لدينا', 'Recommended by us')}
                </span>
              )}
              <p className="truncate text-[11px] text-white/80" dir="ltr">
                {current.phone}
              </p>
              {current.phone && (
                <a
                  href={formatWhatsAppLink(current.phone, `مرحباً، أريد الاستفسار عن متجر ${current.nameAr}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-micro font-bold text-white transition hover:bg-white/25 active:scale-95"
                >
                  <MessageCircle size={10} />
                  {t('تواصل عبر واتساب', 'WhatsApp')}
                </a>
              )}
            </div>
            <button
              type="button"
              aria-label={
                favorites.isFavorite(storeId) ? t('إزالة من المفضلة', 'Remove from favorites') : t('إضافة إلى المفضلة', 'Add to favorites')
              }
              aria-pressed={favorites.isFavorite(storeId)}
              onClick={() => void handleToggleFavorite()}
              disabled={favorites.pending.includes(storeId)}
              className="justify-self-end rounded-full p-2 text-white transition hover:bg-surface/15 active:scale-95 disabled:opacity-60"
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
                    className="absolute -top-0.5 -end-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-micro font-bold text-white"
                  >
                    {cart.itemCount > 99 ? '99+' : cart.itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </header>

        {/* Store status banner — shows when store is not OPEN */}
        {(current.storeStatus === StoreStatus.CLOSED || !current.isAcceptingOrders) && (
          <div className="mx-auto max-w-md px-5 pt-4">
            <div className="flex items-center gap-3 rounded-2xl border border-danger bg-danger-tint px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger text-white">
                <Clock3 size={18} />
              </span>
              <div className="flex-1 text-end">
                <p className="text-xs font-extrabold text-danger-dark">
                  {t('المتجر مغلق حالياً', 'Store is currently closed')}
                </p>
                {current.openingTime && current.closingTime && (
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {t(`يفتح الساعة ${current.openingTime} ويغلق ${current.closingTime}`, `Opens at ${current.openingTime}, closes at ${current.closingTime}`)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {current.storeStatus === StoreStatus.BUSY && current.isAcceptingOrders && (
          <div className="mx-auto max-w-md px-5 pt-4">
            <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <Clock3 size={18} />
              </span>
              <div className="flex-1 text-end">
                <p className="text-xs font-extrabold text-amber-700">
                  {t('المتجر مشغول حالياً — قد يكون هناك تأخير', 'Store is busy — there may be a delay')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quick-browse rail — horizontal scrollable categories.
            Constrained to the app's standard `max-w-md` column like every
            other section on the page, so the title, chips and arrows stay
            visually connected at any viewport width. */}
        <div role="search" className="mx-auto w-full max-w-md px-5 pt-5">
          <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-canvas/80 px-3 focus-within:border-brand focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand/30">
            <Search size={18} className="shrink-0 text-brand" />
            <input value={menuSearch} onChange={event => setMenuSearch(event.target.value)} maxLength={120} aria-label={`ابحث في قائمة ${current.nameAr}`} placeholder={`ابحث في قائمة ${current.nameAr}...`} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
            {menuSearch && <button type="button" aria-label="مسح بحث القائمة" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-brand" onClick={event => { setMenuSearch(''); event.currentTarget.parentElement?.querySelector('input')?.focus(); }}><X size={18} /></button>}
          </div>
        </div>
        <HorizontalScrollGallery
          titleAr={t('فئات المتجر', 'Categories')}
          titleEn={t('فئات المتجر', 'Categories')}
          ariaLabel={t('فئات المتجر', 'Categories')}
          className="mx-auto w-full max-w-md px-5 pt-5"
          trackClassName="gap-2"
          showArrows={false}
        >
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                setActiveCategoryId(category.id);
                setMenuSearch('');
                void hapticTap();
              }}
              aria-pressed={category.id === active}
              className={`flex shrink-0 items-center gap-1.5 min-h-11 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                category.id === active ? 'bg-brand text-white' : 'bg-canvas text-ink-muted'
              }`}
            >
              {category.imageUrl ? (
                <ImageWithFallback
                  src={category.imageUrl}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-md object-cover"
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
                    <ImageWithFallback
                      src={o.imageUrl!}
                      alt={t(o.titleAr, o.titleEn)}
                      className="h-20 w-36 object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="mx-auto w-full max-w-md px-5 pt-5 min-w-0">
          {products.length === 0 ? (
            <p className="py-12 text-center text-xs text-ink-muted">
              {query ? 'لا توجد نتائج مطابقة لبحثك في هذا المتجر' : 'لا توجد منتجات في هذه الفئة حالياً'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {products
                .filter((product) => product.isAvailable)
                .map((product, index) => {
                  const line = cart.lineFor(product.id);
                  return (
                    <article
                      key={product.id}
                      className="group relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-card sq-menu-enter"
                      style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
                    >
                      {/* Offer badge */}
                      {offerProductIds.has(product.id) && (
                        <span className="absolute inset-s-2 top-2 z-10 rounded-full bg-brand px-2 py-0.5 text-micro font-bold text-white shadow-sm">
                          {t('عرض', 'Offer')}
                        </span>
                      )}

                      {/* Media — fixed aspect ratio; elegant gradient fallback */}
                      <div className="relative row-span-2 h-18 w-18 overflow-hidden rounded-xl bg-linear-to-br from-brand-tint to-brand-surface">
                        {product.imageUrl ? (
                          <ImageWithFallback
                            src={product.imageUrl}
                            alt=""
                            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                            fallbackText={product.nameAr.slice(0, 2)}
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xl font-black text-brand-dark sm:text-2xl">
                            {product.nameAr.slice(0, 2)}
                          </span>
                        )}
                      </div>

                      {/* Text & Price */}
                      <div className="flex min-w-0 flex-col text-start">
                        <h3 className="line-clamp-2 text-sm font-bold text-ink">
                          {product.nameAr}
                        </h3>
                        {product.description && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted">
                            {product.description}
                          </p>
                        )}
                        <p className="mt-2 text-sm font-bold text-brand-dark" dir="ltr">
                          {formatCurrency(product.price)}
                        </p>
                      </div>

                      {/* Counter / add */}
                      <div className="col-start-2 mt-2 flex justify-end">
                        {line ? (
                          <div className="flex items-center gap-1 rounded-full bg-brand px-1 py-1 text-white">
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
                            <span className="min-w-4.5 text-center text-xs font-bold">
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
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-brand-dark transition active:scale-90"
                          >
                            <Plus size={18} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </article>
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
              className="fixed inset-x-0 bottom-5 z-20 px-5 safe-bottom"
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

        {/* Product options sheet */}
        {optionsProduct && (
          <ProductOptionsSheet
            product={optionsProduct}
            storeNameAr={current.nameAr}
            onClose={() => setOptionsProduct(null)}
            onConfirm={handleOptionsConfirm}
          />
        )}
      </main>
    </PageTransition>
  );
}
