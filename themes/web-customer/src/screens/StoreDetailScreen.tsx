import { DeliveryEstimate } from '@/components/DeliveryEstimate';
import { StoreOfferSheet } from '@/components/StoreOfferSheet';
import type { Offer } from '@samou-go/shared-types';
import { ProductImageViewer } from '@/components/ProductImageViewer';
import { storeIsOpen } from '@/components/StoreHours';
import { normalizeOptionGroups, resolveSelectedOptions } from '@samou-go/shared-types';
/**
 * `/stores/:storeId` — a store's full catalogue with add-to-cart.
 *
 * The single-source catalogue endpoint `GET /stores/:id` returns categories
 * with their products inlined; the screen renders one sticky category bar and
 * a stepper per product. Basket state lives in the shared CartProvider.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, AlertTriangle, ArrowRight, Clock3, FolderOpen, Heart, Loader2, MessageCircle, Minus, Plus, RefreshCw, ShoppingCart, Star, Store } from 'lucide-react';
import { useCart } from '@/components/CartProvider';
import { useFavorites } from '@/components/FavoritesProvider';
import { useStore, useOffersForStore, usePopularProducts } from '@/hooks/useApi';
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
  const [searchParams] = useSearchParams();
  const targetProductId = searchParams.get('productId');
  const revealedProduct = useRef<string | null>(null);
  const store = useStore(storeId);
  const popular = usePopularProducts(12, { enabled: Boolean(storeId) }, storeId);
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null);
  const cart = useCart();
  const favorites = useFavorites();
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';

  const handleToggleFavorite = async () => {
    const toggled = await favorites.toggle(storeId);
    if (!toggled) navigate('/favorites');
  };

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>('all');
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);

  const [menuSearch, setMenuSearch] = useState('');
  const query = menuSearch.trim().toLocaleLowerCase();
  const categories = useMemo(() => (store.data?.categories ?? []).map(category => ({
    ...category,
    products: category.products.filter(product => product.isAvailable && (!query || product.nameAr.toLocaleLowerCase().includes(query))),
  })).filter(category => !query || category.products.length > 0), [store.data, query]);

  const active = useMemo(
    () => activeCategoryId === "all" ? "all" : activeCategoryId === "popular" && popular.data?.length ? "popular" : categories.some(category => category.id === activeCategoryId) ? activeCategoryId : "all",
    [activeCategoryId, categories, popular.data]
  );

  const targetCategoryId = store.data?.categories.find(category =>
    category.products.some(product => product.id === targetProductId && product.isAvailable)
  )?.id;

  useEffect(() => {
    if (targetCategoryId) {
      setMenuSearch('');
      setActiveCategoryId(targetCategoryId);
    }
  }, [storeId, targetProductId, targetCategoryId]);

  useEffect(() => {
    const key = `${storeId}:${targetProductId}`;
    if (!targetProductId || !targetCategoryId || active !== targetCategoryId || revealedProduct.current === key) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`product-${targetProductId}`);
      if (!element) return;
      element.focus({ preventScroll: true });
      element.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      revealedProduct.current = key;
    });
    return () => cancelAnimationFrame(frame);
  }, [storeId, targetProductId, targetCategoryId, active]);
  const offers = useOffersForStore(storeId);
  const offerProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of offers.data?.items ?? []) {
      for (const pid of o.productIds) ids.add(pid);
    }
    return ids;
  }, [offers.data]);

  const current = store.data!;
  const products = query || active === "all" ? categories.flatMap(category => category.products) : active === "popular" ? popular.data ?? [] : active
    ? categories.find((category) => category.id === active)?.products ?? []
    : [];

  // Product that is currently showing the options sheet.
  const [optionsProduct, setOptionsProduct] = useState<(typeof products)[number] | null>(null);

  const handleAdd = useCallback((productId: string, product: (typeof products)[number]) => {
    if (!current?.isAcceptingOrders || current.storeStatus === StoreStatus.CLOSED) return;
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
  }, [cart, current?.nameAr, current?.isAcceptingOrders, current?.storeStatus]);

  const handleOptionsConfirm = useCallback((options: { groupId: string; optionId: string }[], quantity: number) => {
    if (!optionsProduct || !current?.isActive || !current.isAcceptingOrders || current.storeStatus === StoreStatus.CLOSED) return;
    // Map option IDs to SelectedOption objects.
    const selectedOptions = resolveSelectedOptions(optionsProduct.optionGroups, options);
    cart.addItem(optionsProduct, quantity, '', current.nameAr, selectedOptions);
    setOptionsProduct(null);
    void hapticConfirm();
  }, [optionsProduct, cart, current?.nameAr, current?.isActive, current?.isAcceptingOrders, current?.storeStatus]);

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
        <header className="bg-surface">
          <div className="safe-top relative bg-brand-tint">
            <div className="h-36 overflow-hidden sm:h-44" data-swipe-back="off">
              {current.coverUrl && <ImageWithFallback src={current.coverUrl} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="absolute inset-x-0 top-3 mx-auto flex max-w-md items-center justify-between px-5 safe-top">
            <button
              type="button"
              aria-label={t('رجوع', 'Back')}
              onClick={() => navigate(-1)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-surface/95 p-2 text-ink transition hover:bg-canvas active:scale-95"
            >
              <ArrowRight size={22} className="rtl:rotate-180" />
            </button>
            <button
              type="button"
              aria-label={
                favorites.isFavorite(storeId) ? t('إزالة من المفضلة', 'Remove from favorites') : t('إضافة إلى المفضلة', 'Add to favorites')
              }
              aria-pressed={favorites.isFavorite(storeId)}
              onClick={() => void handleToggleFavorite()}
              disabled={favorites.pending.includes(storeId)}
              className="justify-self-end flex h-11 w-11 items-center justify-center rounded-full bg-surface/95 p-2 text-ink transition hover:bg-canvas active:scale-95 disabled:opacity-60"
            >
              <Heart size={20} fill={favorites.isFavorite(storeId) ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              aria-label={`السلة (${cart.itemCount})`}
              onClick={() => navigate('/cart')}
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-surface/95 p-2 text-ink transition hover:bg-canvas active:scale-95"
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
            <div className="absolute inset-x-0 -bottom-10 flex justify-center">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-surface bg-surface p-1 shadow-card">
                {current.logoUrl ? <ImageWithFallback src={current.logoUrl} alt={t('شعار المتجر', 'Store logo')} className="h-full w-full object-contain" /> : <Store size={36} className="text-brand" />}
              </div>
            </div>
          </div>
            <div className="mx-auto max-w-md px-5 pb-5 pt-14 text-center">
              <h1 className="text-lg font-extrabold">{t(current.nameAr, current.nameEn)}</h1>
              {current.publicCode && <p className="text-xs text-ink-muted">رقم المتجر: <span dir="ltr">{current.publicCode}</span></p>}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="rounded-full bg-brand-tint px-3 py-2 font-bold">{!storeIsOpen(current) ? t('مغلق حالياً', 'Closed') : current.storeStatus === StoreStatus.BUSY ? t('مشغول — يستقبل الطلبات', 'Busy — accepting orders') : t('مفتوح ويستقبل الطلبات', 'Open for orders')}</span>
                <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2"><Clock3 size={16} className="text-brand" /><strong>{t('مواعيد العمل', 'Opening hours')}</strong><span dir={current.openingTime ? 'ltr' : undefined}>{current.openingTime ? `${current.openingTime}${current.closingTime ? ` – ${current.closingTime}` : ''}` : t('مواعيد العمل غير محددة', 'Hours not set')}</span></span>
              </div>
              <DeliveryEstimate store={current} />
              {current.isRecommended && (
                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-micro font-bold text-brand-dark">
                  <Star size={10} fill="currentColor" />
                  {t('موصى به لدينا', 'Recommended by us')}
                </span>
              )}
              <p className="truncate text-[11px] text-ink-muted" dir="ltr">
                {current.phone}
              </p>
              {current.phone && (
                <a
                  href={formatWhatsAppLink(current.phone, `مرحباً، أريد الاستفسار عن متجر ${current.nameAr}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-micro font-bold text-brand-dark transition hover:bg-brand/10 active:scale-95"
                >
                  <MessageCircle size={10} />
                  {t('تواصل عبر واتساب', 'WhatsApp')}
                </a>
              )}
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
        <div className="sticky top-0 z-20 border-b border-line bg-surface safe-top">
          <div className="mx-auto flex max-w-md items-center gap-3 px-5 pt-2">
            <button type="button" onClick={() => navigate(-1)} aria-label={t('العودة من المتجر', 'Leave store')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canvas focus-visible:ring-2 focus-visible:ring-brand"><ArrowRight size={20} className="rtl:rotate-180" /></button>
            {current.logoUrl && <ImageWithFallback src={current.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-contain" />}
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{current.nameAr}</span>
          </div>
        <HorizontalScrollGallery
          titleAr={t('فئات المتجر', 'Categories')}
          titleEn={t('فئات المتجر', 'Categories')}
          ariaLabel={t('فئات المتجر', 'Categories')}
          className="mx-auto w-full max-w-md px-5 py-2"
          trackClassName="gap-2"
          showArrows={false}
        >
          <button type="button" aria-pressed={active === 'all'} onClick={() => { setActiveCategoryId('all'); setMenuSearch(''); }} className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-bold ${active === 'all' ? 'bg-brand text-white' : 'bg-canvas text-ink-muted'}`}>{t('كل القائمة', 'Full menu')}</button>
          {!!popular.data?.length && <button type="button" aria-pressed={active === 'popular'} onClick={() => { setActiveCategoryId('popular'); setMenuSearch(''); }} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-bold ${active === 'popular' ? 'bg-brand text-white' : 'bg-canvas text-ink-muted'}`}><Star size={14} />{t('الأكثر طلباً', 'Most ordered')}</button>}
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
        </div>

        {!!offers.data?.items.length && <section className="mx-auto max-w-md px-5 pt-5" aria-label={t('عروض المتجر', 'Store offers')}>
          <h2 className="mb-3 text-lg font-extrabold">{t('عروض تستحق التجربة', 'Offers worth trying')}</h2>
          <div data-swipe-back="off" className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2">
            {offers.data.items.map(offer => <button key={offer.id} type="button" onClick={() => setSelectedOffer(offer)} className="w-64 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface text-start shadow-card focus-visible:ring-2 focus-visible:ring-brand">
              <ImageWithFallback src={offer.imageUrl ?? current.coverUrl ?? undefined} alt={t(offer.titleAr, offer.titleEn)} className="h-36 w-full object-cover" fallbackText={offer.titleAr} />
              <div className="space-y-2 p-3"><h3 className="font-bold">{t(offer.titleAr, offer.titleEn)}</h3><div className="flex items-center justify-between text-sm font-bold text-brand"><span>{t('شاهد العرض', 'View offer')}</span>{offer.price != null && <span dir="ltr">{formatCurrency(offer.price)}</span>}</div></div>
            </button>)}
          </div>
        </section>}

        <div className="mx-auto w-full max-w-md px-5 pt-5 min-w-0">
          {products.length === 0 ? (
            <p className="py-12 text-center text-xs text-ink-muted">
              {query ? 'لا توجد نتائج مطابقة لبحثك في هذا المتجر' : 'لا توجد منتجات في هذه الفئة حالياً'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {products
                .filter((product) => product.isAvailable)
                .map((product, index) => {
                  const line = cart.lineFor(product.id);
                  const groups = normalizeOptionGroups(product.optionGroups);
                  const hasOptions = groups.length > 0;
                  const hasSize = groups.some(group => /حجم|أحجام|احجام|size/i.test(group.name));
                  const orderable = storeIsOpen(current);
                  return (
                    <article
                      key={product.id}
                      id={"product-" + product.id}
                      tabIndex={-1}
                      className="group relative scroll-mt-44 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card sq-menu-enter"
                      style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
                    >
                      {/* Offer badge */}
                      {offerProductIds.has(product.id) && (
                        <span className="absolute inset-s-2 top-2 z-10 rounded-full bg-brand px-2 py-0.5 text-micro font-bold text-white shadow-sm">
                          {t('عرض', 'Offer')}
                        </span>
                      )}

                      {/* Media — fixed aspect ratio; elegant gradient fallback */}
                      <button type="button" disabled={!product.imageUrl} aria-label={t(`تكبير صورة ${product.nameAr}`, `Enlarge ${product.nameAr}`)} onClick={() => { if (product.imageUrl) setPreview({ src: product.imageUrl, name: product.nameAr }); }} className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-linear-to-br from-brand-tint to-brand-surface focus-visible:ring-2 focus-visible:ring-brand">
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
                      </button>

                      {/* Text & Price */}
                      <div className="flex min-w-0 flex-1 flex-col px-3 pt-3 text-start">
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
                      <div className="mt-auto flex justify-center p-3">
                        {line && !hasOptions ? (
                          <div className="flex items-center gap-1 rounded-full bg-brand px-1 py-1 text-white">
                            <button
                              type="button"
                              aria-label={t('إنقاص', 'Decrease')}
                              onClick={() => {
                                cart.setQuantity(product.id, line.quantity - 1);
                                void hapticTap();
                              }}
                              className="flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="min-w-4.5 text-center text-xs font-bold">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={t('زيادة', 'Increase')}
                              disabled={!orderable}
                              onClick={() => {
                                cart.setQuantity(product.id, line.quantity + 1);
                                void hapticTap();
                              }}
                              className="flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={!orderable ? t("المتجر مغلق", "Store closed") : hasOptions ? t(`اختر خيارات ${product.nameAr}`, `Customize ${product.nameAr}`) : `أضف ${product.nameAr} إلى السلة`}
                            disabled={!orderable}
                            onClick={() => handleAdd(product.id, product)}
                            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-tint px-2 text-xs font-bold text-brand-dark transition active:scale-95 disabled:bg-canvas disabled:text-ink-muted"
                          >
                            {!orderable ? t('المتجر مغلق', 'Store closed') : hasOptions ? hasSize ? t('اختر الحجم', 'Choose size') : t('اختر الإضافات', 'Choose extras') : <><Plus size={18} strokeWidth={2.5} />{t('إضافة', 'Add')}</>}
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
                  <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-white/20 px-2" dir="ltr">{cart.itemCount}</span> {t('عرض السلة', 'View cart')}
                </span>
                <span className="text-end text-xs font-bold">
                  <span className="block text-micro font-normal">{t("مجموع المنتجات", "Products subtotal")}</span><span dir="ltr">{formatCurrency(cart.subtotal)}</span>
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {selectedOffer && <StoreOfferSheet offer={selectedOffer} storeName={current.nameAr} canOrder={storeIsOpen(current)} onClose={() => setSelectedOffer(null)} onAdd={() => { if (selectedOffer.price != null && selectedOffer.price > 0 && storeIsOpen(current)) { cart.addOfferItem({ ...selectedOffer, price: selectedOffer.price }, 1, current.nameAr); setSelectedOffer(null); navigate('/cart'); } }} onBrowse={() => { setSelectedOffer(null); setActiveCategoryId('all'); setMenuSearch(''); }} />}
        {preview && <ProductImageViewer src={preview.src} name={preview.name} onClose={() => setPreview(null)} />}
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
