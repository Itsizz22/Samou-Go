import { FeaturedStoreCard, StoreCard, StoreCardSkeleton } from '@/components/home/StoreCards';
import { usePlatformSettings } from '@samou-go/api-client';
import type { HomeCategory } from '@samou-go/shared-types';
import { ActiveOrderStrip } from '@/components/ActiveOrderStrip';
import { storeIsOpen } from '@/components/StoreHours';
import { CatalogueSearchField } from '@/components/CatalogueSearchField';
import { ConnectionNotice } from '@/components/ConnectionNotice';
import { ZoneSelector } from '@/components/ZoneProvider';
import { HomeProductSearch } from '@/components/HomeProductSearch';
import { normalizeOptionGroups, resolveSelectedOptions } from '@samou-go/shared-types';
import { DiscoverySections } from '@/components/DiscoverySections';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Apple,
  Beef,
  Cake,
  ChevronLeft,
  Coffee,
  LayoutGrid,
  Loader2,
  MapPin,
  Menu,
  MessageSquarePlus,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store as StoreIcon,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { BrandLogo, ImageWithFallback, NotificationBell, useLanguage, type BellNotification } from '@samou-go/ui';
import { BottomNav } from '@/components/BottomNav';
import { SupportWhatsAppButton } from '@/components/SupportWhatsAppButton';
import { useDrawer } from '@/components/NavigationDrawer';
import { FeaturedProductsShowcase } from '@/components/FeaturedProductsShowcase';
import { CravingShortcuts } from '@/components/CravingShortcuts';
import { PromoBannerSlider } from '@/components/PromoBannerSlider';
import { VideoAdCarousel } from '@/components/VideoAdCarousel';
import { useOrders, useStores, useAuth, useAllOffers, useFeaturedProducts, type PopularProduct } from '@/hooks/useApi';
import { useFavorites } from '@/components/FavoritesProvider';
import { useCart } from '@/components/CartProvider';
import { ProductOptionsSheet } from '@/components/ProductOptionsSheet';
import { hapticConfirm } from '@/lib/haptics';
import { Link, useNavigate } from 'react-router-dom';
import { ORDER_STATUS_LABELS, OrderStatus } from '@samou-go/shared-types';
import {
  STORE_CATEGORIES,
  classifyStore,
  toStoreCardModel,
  type StoreCardModel,
  type StoreCategoryKey,
} from '@samou-go/ui';

/** Icon per category chip. The taxonomy itself lives in `lib/store-display.ts`. */
const CATEGORY_ICONS: Record<StoreCategoryKey, LucideIcon> = {
  pharmacy: StoreIcon,
  all: LayoutGrid,
  restaurant: Utensils,
  cafe: Coffee,
  supermarket: ShoppingBag,
  shop: StoreIcon,
  bakery_sweets: Cake,
  butchery: Beef,
  vegetables_fruits: Apple,
};

/** How many stores head the horizontal strip before the full list repeats them. */
const FEATURED_COUNT = 12;

/** Long enough to finish typing an Arabic word, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 350;

/** Bell accent per order status, so a delivery feels different from a cancel. */
const STATUS_BELL_TONE: Record<OrderStatus, NonNullable<BellNotification['tone']>> = {
  [OrderStatus.PENDING]: 'warning',
  [OrderStatus.ACCEPTED]: 'info',
  [OrderStatus.PREPARING]: 'warning',
  [OrderStatus.READY_FOR_PICKUP]: 'info',
  [OrderStatus.ON_THE_WAY]: 'info',
  [OrderStatus.DELIVERED]: 'brand',
  [OrderStatus.CANCELLED]: 'danger',
};

export function SamouGoHome() {
  const navigate = useNavigate();
  const appearance = usePlatformSettings({ pollMs: 60000 });
  const categories: HomeCategory[] = useMemo(() => appearance.data?.homeCategories ?? STORE_CATEGORIES.map(category => ({ ...category, enabled: true })), [appearance.data?.homeCategories]);
  const { openDrawer } = useDrawer();
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'open' | 'closed'>('all');
  // Keep the first row visible; expand the remaining categories inline.


  // Every keystroke would otherwise be a round-trip over Samou' mobile data.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // GET /api/v1/stores — the catalogue. Search is server-side; the category
  // chips filter client-side because the schema has no store-type column yet.
  const stores = useStores({
    activeOnly: availabilityFilter === 'open',
    pageSize: 24,

  });

  const recommended = useStores({ activeOnly: true, recommendedOnly: true, pageSize: FEATURED_COUNT });

  const freeDeliveryEnabled = appearance.data?.freeDeliveryEnabled === true;

  // Signed-in customers see their live orders in the header bell; anonymous
  // visitors keep a quiet bell with no badge. The home itself stays public.
  const auth = useAuth();
  const orders = useOrders(
    { pageSize: 8 },
    { enabled: Boolean(auth.user), pollMs: 15_000 }
  );

  const ongoing = useOrders({ activeOnly: true, pageSize: 8 }, { enabled: auth.user?.role === 'CUSTOMER', pollMs: 15000 });

  // Server-backed favorites, shared across every screen. A guest who taps a
  // heart is routed to the Favorites screen (the sign-in gate).
  const favorites = useFavorites();
  const toggleLike = async (storeId: string) => {
    const toggled = await favorites.toggle(storeId);
    if (!toggled) navigate('/favorites');
  };

  const cards: StoreCardModel[] = useMemo(() => {
    const items = stores.data?.items ?? [];
    const filtered =
      activeCategory === 'all'
        ? items
        : items.filter((store) => { const selected = categories.find(category => category.key === activeCategory); return selected?.storeIds ? selected.storeIds.includes(store.id) : !categories.some(category => category.key !== 'all' && category.storeIds?.includes(store.id)) && classifyStore(store) === activeCategory; });
    return filtered
      .filter((store) => availabilityFilter === 'all' || (availabilityFilter === 'open' ? storeIsOpen(store) : !storeIsOpen(store)))
      .map(store => { const card = toStoreCardModel(store); const custom = categories.find(category => category.key !== 'all' && category.storeIds?.includes(store.id)); return custom ? { ...card, category: { ...card.category, ar: custom.ar, en: custom.en } } : card; });
  }, [stores.data, activeCategory, availabilityFilter, categories]);

  // Store-wide active offers feed.
  const offers = useAllOffers();
  const activeOffers = useMemo(() => (offers.data?.items ?? []).slice(0, 6), [offers.data]);

  // Featured dishes from eligible food venues, in admin-selected order.
  const popular = useFeaturedProducts();
  const dishProducts = popular.data ?? [];
  const cart = useCart();
  const [optionsProduct, setOptionsProduct] = useState<PopularProduct | null>(null);

  const handlePopularAdd = (product: PopularProduct) => {
    if (product.optionsEnabled && product.hasOptions && normalizeOptionGroups(product.optionGroups).length > 0) {
      setOptionsProduct(product);
      return;
    }
    cart.addItem(product, 1, '', product.storeNameAr);
    void hapticConfirm();
  };

  const handlePopularOptionsConfirm = (options: { groupId: string; optionId: string }[], quantity: number) => {
    if (!optionsProduct) return;
    const selectedOptions = resolveSelectedOptions(optionsProduct.optionGroups, options);
    cart.addItem(optionsProduct, quantity, '', optionsProduct.storeNameAr, selectedOptions);
    setOptionsProduct(null);
    void hapticConfirm();
  };

  const featured = (recommended.data?.items ?? []).filter(store => store.isRecommended).map(toStoreCardModel);
  const showEmpty = !stores.loading && !stores.error && cards.length === 0;

  // The customer's notification center: one row per recent order, keyed by
  // status so a status change surfaces as a fresh unread notification. Tapping
  // a row jumps straight to the live tracking screen for that order.
  const bellNotifications: BellNotification[] = useMemo(() => {
    if (!auth.user) return [];
    return (orders.data?.items ?? []).map((order) => ({
      id: `order:${order.id}:${order.status}`,
      ar: `طلب ${order.orderNumber} — ${ORDER_STATUS_LABELS[order.status].ar}`,
      en: ORDER_STATUS_LABELS[order.status].en,
      caption: order.storeNameAr,
      href: `/orders/${encodeURIComponent(order.id)}`,
      tone: STATUS_BELL_TONE[order.status],
    }));
  }, [auth.user, orders.data]);



  return <main dir={isArabic ? "rtl" : "ltr"} className="customer-home sq-customer-screen min-h-screen bg-canvas pb-28 font-sans text-ink">
      <a href="#home-results" className="sr-only focus:not-sr-only focus:block focus:p-3">تجاوز إلى المتاجر</a>
      <header className="home-header px-5 pb-4 pt-3">
        <nav className="mx-auto flex max-w-md items-center justify-between gap-2" aria-label="Main navigation">
          <button
            type="button"
            aria-label={t('القائمة', 'Menu')}
            onClick={openDrawer}
            className="inline-flex items-center justify-center min-h-11 min-w-11 shrink-0 rounded-xl bg-surface p-2 text-ink transition hover:bg-brand-surface active:scale-95"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <BrandLogo size={34} />
            <span className="text-lg font-bold tracking-tight text-brand">سموع كويك</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <NotificationBell
              notifications={bellNotifications}
              storageKey="customer"
              onNavigate={(href) => { navigate(href); }}
            />
            <Link
              to="/cart"
              aria-label="Cart"
              className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-surface text-ink transition hover:bg-brand-surface"
            >
              <ShoppingCart size={20} />
              {cart.itemCount > 0 && <span key={cart.itemCount} className="cart-bump absolute inset-e-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{cart.itemCount}</span>}
            </Link>
          </div>
        </nav>
<div className="mx-auto mt-3 flex max-w-md items-center gap-3 rounded-2xl bg-surface px-3 py-1"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand"><MapPin size={20} aria-hidden="true" /></span><ZoneSelector compact /></div>
      </header>
      {auth.user?.role === 'CUSTOMER' && <><ActiveOrderStrip orders={ongoing.data?.items ?? []} />{(ongoing.data?.total ?? 0) > 8 && <Link className="mx-auto block max-w-md px-5 pb-3 text-sm text-brand" to="/orders">عرض كل الطلبات الجارية</Link>}</>}
      <ConnectionNotice loading={stores.loading || popular.loading} failed={Boolean(stores.error || popular.error)} retry={() => { stores.reload(); popular.reload(); }} />

      <section className="mx-auto max-w-md px-5">
        <h1 className="market-headline">{t('شو بدك نوصلك اليوم؟', 'What can we bring you today?')}</h1>
        <p className="market-subtitle">{t('مطاعم ومتاجر السموع، بمكان واحد', 'Local restaurants and stores, in one place')}</p>
        <CatalogueSearchField value={searchTerm} onChange={setSearchTerm} onSearch={() => setDebouncedSearch(searchTerm.trim())} />
      </section>

      {searchTerm.trim() && (searchTerm.trim() !== debouncedSearch
        ? <p id="catalogue-search-results" role="status" className="mx-auto max-w-md px-5 pt-6 text-sm text-ink-muted">جارٍ البحث…</p>
        : <HomeProductSearch key={debouncedSearch} query={debouncedSearch} onAdd={handlePopularAdd} />)}
      {!searchTerm.trim() && <>
      <section className="market-section market-categories" aria-label={t('فئات المتاجر', 'Store categories')}>
        <div id="category-chips" data-swipe-back="off" className="market-category-track">
          {categories.filter(category => category.enabled).map(category => {
            const Icon = CATEGORY_ICONS[category.key as StoreCategoryKey] ?? StoreIcon;
            const photo = category.imageUrl;
            return <button key={category.key} type="button" aria-pressed={activeCategory === category.key} onClick={() => setActiveCategory(category.key)} className="market-category">
              {photo ? <ImageWithFallback src={photo} alt="" className="size-7 rounded-lg object-cover" /> : <Icon size={19} aria-hidden="true" />}<span>{t(category.ar, category.en)}</span>
            </button>;
          })}
        </div>
      </section>
      {!searchTerm.trim() && <div className="market-more">
      {!recommended.error && (recommended.loading || featured.length > 0) && <section className="market-section" aria-labelledby="featured-title" aria-busy={recommended.loading}>
        <div className="market-section-heading"><div><h2 id="featured-title">{t('المتاجر المميزة', 'Featured stores')}</h2><p>{t('اكتشف متاجر السموع', 'Discover local stores')}</p></div><a href="#home-results" className="market-text-action">{t('عرض الكل', 'See all')}</a></div>
        <div data-swipe-back="off" className="market-featured-track">
          {recommended.loading ? [0,1,2].map(i => <StoreCardSkeleton key={i} featured />) : featured.map((card, index) => <FeaturedStoreCard key={card.store.id} card={card} freeDelivery={freeDeliveryEnabled} eager={index === 0} favorite={favorites.isFavorite(card.store.id)} pending={favorites.pending.includes(card.store.id)} onFavorite={() => { void toggleLike(card.store.id); }} />)}
        </div>
      </section>}
      <FeaturedProductsShowcase products={dishProducts} loading={popular.loading} onAdd={handlePopularAdd} />
      <CravingShortcuts />

      <PromoBannerSlider />





      <DiscoverySections onAdd={handlePopularAdd} featuredProducts={dishProducts} />
      <PromoBannerSlider kind="product" />
      <VideoAdCarousel />

      {/* Store Ads & Offers Feed */}
      {(offers.loading || activeOffers.length > 0) && <section className="mx-auto max-w-md px-5 pt-7" id="exclusive-offers" aria-labelledby="offers-title">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="offers-title" className="text-lg font-extrabold">{t('من قوائم متاجرنا', 'From our stores')}</h2>
        </div>
        {offers.loading ? (
          <div data-swipe-back="off" className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 scrollbar-none">
            {[0, 1, 2].map(index => (
              <div key={index} className="skeleton w-full overflow-hidden rounded-[20px] border border-line shadow-card" aria-hidden="true">
                <div className="h-32.5 bg-line-soft" />
                <div className="space-y-2 p-3">
                  <div className="ms-auto h-3 w-2/3 rounded bg-line-soft" />
                  <div className="ms-auto h-2.5 w-1/2 rounded bg-line-soft" />
                </div>
              </div>
            ))}
          </div>
        ) : activeOffers.length > 0 ? (
          <div data-swipe-back="off" className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 scrollbar-none">
            {activeOffers.map((offer) => (
              <Link
                key={offer.id}
                to={`/stores/${encodeURIComponent(offer.storeId)}`}
                className="w-[86%] shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised focus:outline-none focus:ring-2 focus:ring-brand/40"
              >
                {offer.imageUrl ? (
                  <img
                    src={offer.imageUrl}
                    alt=""
                    className="h-32.5 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-32.5 items-center justify-center bg-linear-to-br from-brand/10 to-brand/5">
                    <Star size={28} className="text-brand/30" />
                  </div>
                )}
                <div className="p-4 text-start">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-extrabold">{t(offer.titleAr, offer.titleEn)}</p>
                    {offer.price != null && offer.price > 0 && (
                      <span className="shrink-0 rounded-lg bg-brand px-2 py-0.5 text-[11px] font-black text-white" dir="ltr">
                        {offer.price} ₪
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-micro text-ink-muted">{t(offer.descriptionAr, offer.descriptionEn)}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-5 text-center shadow-card">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-surface text-brand">
              <Star size={18} />
            </span>
            <p className="mt-2 text-xs font-bold text-ink-muted">{t('لا توجد عروض حالياً — تابع المتاجر للحصول على أحدث العروض', 'No offers yet — follow stores for the latest deals')}</p>
          </div>
        )}
      </section>}

</div>}
      {stores.error && <section className="mx-auto max-w-md px-5 pt-8" aria-live="assertive">
          <div className="rounded-2xl border border-danger-tint bg-surface p-5 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink"><AlertTriangle size={22} /></span>
            <h2 className="mt-3 text-sm font-extrabold">{t('تعذّر تحميل المتاجر', 'Could not load stores')}</h2>
            <p className="mt-2 text-xs text-ink-soft">{isArabic ? stores.error.message : stores.error.localizedMessage}</p>
            <button type="button" onClick={stores.refresh} disabled={stores.refreshing} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60">
              {stores.refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {t('إعادة المحاولة', 'Retry')}
            </button>
          </div>
        </section>}

      {showEmpty && <section className="mx-auto max-w-md px-5 pt-8" aria-live="polite">
          <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand"><StoreIcon size={22} /></span>
            <h2 className="mt-3 text-sm font-extrabold">{t(debouncedSearch ? 'لا توجد نتائج مطابقة' : 'لا توجد متاجر متاحة حالياً', debouncedSearch ? 'No matching stores' : 'No stores available yet')}</h2><button className="market-text-action mt-3" type="button" onClick={() => { setActiveCategory('all'); setAvailabilityFilter('all'); setSearchTerm(''); }}>{t('مسح الفلاتر', 'Reset filters')}</button>
          </div>
        </section>}



      </>}
      {/* Product Options Sheet (for popular products with addons) */}
      {optionsProduct && (
        <ProductOptionsSheet
          product={optionsProduct}
          storeNameAr={optionsProduct.storeNameAr}
          onClose={() => setOptionsProduct(null)}
          onConfirm={handlePopularOptionsConfirm}
        />
      )}

      {!searchTerm.trim() && <>
      {/* Custom Order quick-action banner */}
      <section className="mx-auto max-w-md px-5" aria-label="Custom order">
        <Link
          to="/custom-requests"
          className="flex items-center gap-3 rounded-[20px] border border-brand bg-brand-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised active:scale-[0.98]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white">
            <MessageSquarePlus size={20} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1 text-start">
            <p className="text-base font-bold text-brand">{t('طلب خاص', 'Custom Order')}</p>
            <p className="mt-0.5 text-micro text-ink-muted">{t('مش لاقي اللي بدك ياه؟ أرسل طلبك ونتابع معك.', 'Can’t find it? Send us your request.')}<span className="mt-2 block font-bold text-brand">{t('اطلب الآن ←', 'Request now →')}</span></p>
          </div>
        </Link>
      </section>



      </>}

      {!searchTerm.trim() && !stores.error && <section id="home-results" aria-live="polite" className="scroll-mt-4 mx-auto max-w-md px-5 pt-8" aria-labelledby="nearby-title" aria-busy={stores.loading}>
        <div className="mb-4 flex items-end justify-between"><div><h2 id="nearby-title" className="text-lg font-extrabold">{t('كل المتاجر', "All stores in Al-Samou'")}</h2></div>{stores.refreshing ? <Loader2 size={16} className="animate-spin text-brand" aria-label="Refreshing" /> : <ChevronLeft size={18} className="text-ink-subtle" />}</div>
        <div className="market-filters" aria-label={t('تصفية حسب حالة المتجر', 'Store availability')}>
          {([['all', t('الكل', 'All')], ['open', t('مفتوح الآن', 'Open now')], ['closed', t('مغلق', 'Closed')]] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={availabilityFilter === value} onClick={() => setAvailabilityFilter(value)}>{label}</button>)}
        </div>
        <div className="market-store-grid">
          {stores.loading ? [0,1,2,3].map(i => <StoreCardSkeleton key={i} />) : cards.map(card => <StoreCard key={card.store.id} card={card} freeDelivery={freeDeliveryEnabled} />)}
        </div>
      </section>}


      <BottomNav />
      <SupportWhatsAppButton />
    </main>;
}
