import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Apple,
  Beef,
  Cake,
  ChevronDown,
  ChevronLeft,
  Coffee,
  Flame,
  Heart,
  LayoutGrid,
  Loader2,
  MapPin,
  Menu,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store as StoreIcon,
  Tag,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { BrandLogo, ImageWithFallback, NotificationBell, useLanguage, type BellNotification } from '@samou-go/ui';
import { BottomNav } from '@/components/BottomNav';
import { SupportWhatsAppButton } from '@/components/SupportWhatsAppButton';
import { useDrawer } from '@/components/NavigationDrawer';
import { DeliveryFee } from '@samou-go/ui';
import { API_URL, ENABLE_LOCATION } from '@/hooks/useApi';
import { PromoBannerSlider } from '@/components/PromoBannerSlider';
import { useApiMeta, useOrders, useStores, useAuth, useAllOffers, usePopularProducts, type PopularProduct } from '@/hooks/useApi';
import { useFavorites } from '@/components/FavoritesProvider';
import { useCart } from '@/components/CartProvider';
import { ProductOptionsSheet } from '@/components/ProductOptionsSheet';
import { hapticConfirm } from '@/lib/haptics';
import { formatCurrency } from '@/lib/delivery';
import { Link, useNavigate } from 'react-router-dom';
import { DEFAULT_DELIVERY_FEE_CONFIG } from '@/lib/delivery';
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
const FEATURED_COUNT = 5;

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
  const { openDrawer } = useDrawer();
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';
  const [activeCategory, setActiveCategory] = useState<StoreCategoryKey>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'open' | 'closed'>('all');
  // The category chip rail is collapsible on phones (thin screens); it stays
  // permanently expanded on wider viewports where horizontal scroll is usable.
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);



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
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  });

  // GET /api/v1/meta — the tariff the server is actually charging, so the
  // Delivery fee is determined by the driver upon pickup.
  const meta = useApiMeta();
  const baseFee = meta.data?.deliveryFee.baseFee ?? DEFAULT_DELIVERY_FEE_CONFIG.baseFee;

  // Signed-in customers see their live orders in the header bell; anonymous
  // visitors keep a quiet bell with no badge. The home itself stays public.
  const auth = useAuth();
  const orders = useOrders(
    { pageSize: 8 },
    { enabled: Boolean(auth.user), pollMs: 15_000 }
  );

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
        : items.filter((store) => classifyStore(store) === activeCategory);
    return filtered
      .filter((store) => availabilityFilter === 'all' || (availabilityFilter === 'open' ? store.isActive : !store.isActive))
      .map(toStoreCardModel);
  }, [stores.data, activeCategory, availabilityFilter]);

  // Store-wide active offers feed.
  const offers = useAllOffers();
  const activeOffers = useMemo(() => (offers.data?.items ?? []).slice(0, 6), [offers.data]);

  // Popular products across all stores.
  const popular = usePopularProducts(12);
  const cart = useCart();
  const [optionsProduct, setOptionsProduct] = useState<PopularProduct | null>(null);

  const handlePopularAdd = (product: PopularProduct) => {
    if (product.hasOptions && product.optionGroups && product.optionGroups.length > 0) {
      setOptionsProduct(product);
      return;
    }
    // Add directly to cart (synthesize a Product-like object).
    cart.addItem({
      id: product.id,
      nameAr: product.nameAr,
      description: product.description,
      price: product.price,
      imageUrl: product.imageUrl,
      isAvailable: product.isAvailable,
      categoryId: null,
      storeId: product.storeId,
    } as any, 1, '', product.storeNameAr);
    void hapticConfirm();
  };

  const handlePopularOptionsConfirm = (options: { groupId: string; optionId: string }[], quantity: number) => {
    if (!optionsProduct) return;
    const selectedOptions = options.map(o => {
      const group = optionsProduct.optionGroups!.find(g => g.id === o.groupId);
      const item = group?.items.find(i => i.id === o.optionId);
      return {
        id: o.optionId,
        groupId: o.groupId,
        name: item?.name ?? '',
        priceDelta: item?.priceDelta ?? 0,
      };
    });
    cart.addItem({
      id: optionsProduct.id,
      nameAr: optionsProduct.nameAr,
      description: optionsProduct.description,
      price: optionsProduct.price,
      imageUrl: optionsProduct.imageUrl,
      isAvailable: optionsProduct.isAvailable,
      categoryId: null,
      storeId: optionsProduct.storeId,
    } as any, quantity, '', optionsProduct.storeNameAr, selectedOptions);
    setOptionsProduct(null);
    void hapticConfirm();
  };

  const featured = cards.slice(0, FEATURED_COUNT);
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



  return <main dir="rtl" className="customer-home sq-customer-screen min-h-screen bg-canvas pb-28 font-sans text-ink">
      <header className="bg-canvas px-5 py-4">
        <nav className="mx-auto flex max-w-lg items-center justify-between gap-2" aria-label="Main navigation">
          <button
            type="button"
            aria-label={t('القائمة', 'Menu')}
            onClick={openDrawer}
            className="inline-flex items-center justify-center min-h-11 min-w-11 shrink-0 rounded-full p-2 text-slate-700 transition hover:bg-slate-100 active:scale-95"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <BrandLogo size={34} />
            <span className="text-[17px] font-bold tracking-tight text-slate-950">سموع كويك</span>
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
              className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100"
            >
              <ShoppingCart size={20} />
              {cart.itemCount > 0 && <span key={cart.itemCount} className="cart-bump absolute inset-e-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">{cart.itemCount}</span>}
            </Link>
          </div>
        </nav>
        <section className="mx-auto mt-5 flex max-w-md items-end justify-between" aria-label="Location and greeting">
          {ENABLE_LOCATION && (
            <div className="flex items-center gap-2 text-end"><MapPin size={18} /><div><p className="text-sm font-semibold">{t('السموع، الخليل', "Al-Samou', Hebron")}</p></div></div>
          )}
          <div className="text-start"><p className="text-lg font-bold">{t('مرحباً! 👋', 'Hello! 👋')}</p></div>
        </section>
      </header>

      <section className="mx-auto max-w-md px-5" role="search" aria-label="Search">
        <label className="mt-4 flex h-12 cursor-text items-center gap-3 rounded-xl border border-line bg-surface px-4 text-ink-muted transition-all duration-200 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <Search size={20} className="shrink-0 text-brand" />
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            enterKeyHint="search"
            aria-controls="home-results"
            onKeyDown={event => { if (event.key === 'Enter') setDebouncedSearch(searchTerm.trim()); }}
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle"
            placeholder={t('ابحث عن متاجر أو منتجات', 'Search stores or products…')}
            aria-label={t('ابحث عن متاجر أو منتجات', 'Search stores or products')}
          />
          {stores.refreshing && <Loader2 size={16} className="shrink-0 animate-spin text-brand" aria-label="Searching" />}
        </label>
      </section>

      {/* ==========================================================================
          BANNER SLIDER INJECTION POINT
          The upcoming dynamic Banner Slider component will render here — just below
          the main Header/Search and above the Store Rails. Keep this marker element
          (id: banners-slider-placeholder) so the injection point is always locatable.
          ======================================================================== */}
      <PromoBannerSlider />

      {/* Custom Order quick-action banner */}
      <section className="mx-auto max-w-md px-5 pt-5" aria-label="Custom order">
        <Link
          to="/custom-requests"
          className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised active:scale-[0.98]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-brand">
            <MessageSquarePlus size={20} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1 text-end">
            <p className="text-sm font-extrabold text-brand-deep">{t('طلب خاص', 'Custom Order')}</p>
            <p className="mt-0.5 text-micro text-ink-muted">{t('اطلب منتج غير موجود في القائمة', 'Order something not on the menu')}</p>
          </div>
          <ChevronLeft size={18} className="shrink-0 text-brand" />
        </Link>
      </section>



      <section className="mx-auto max-w-md px-5 pt-7" aria-labelledby="categories-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 id="categories-title" className="text-lg font-extrabold">{t('الفئات', 'Categories')}</h2>
          </div>
          <button
            type="button"
            aria-expanded={!categoriesCollapsed}
            aria-controls="category-chips"
            onClick={() => setCategoriesCollapsed(collapsed => !collapsed)}
            className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1.5 text-micro font-bold text-brand shadow-card transition hover:bg-brand-surface md:hidden"
          >
            {categoriesCollapsed ? (
              <>
                {t('عرض الفئات', 'Show')}
              </>
            ) : (
              <>
                {t('إخفاء', 'Hide')}
              </>
            )}
            <ChevronDown
              size={14}
              className={`transition-transform ${categoriesCollapsed ? '' : 'rotate-180'}`}
            />
          </button>
        </div>
        <div
          id="category-chips"
          className={`${categoriesCollapsed ? 'hidden md:flex' : 'flex'} gap-3 overflow-x-auto pb-1 scrollbar-none`}
        >
          {STORE_CATEGORIES.map(category => {
          const Icon = CATEGORY_ICONS[category.key];
          const active = activeCategory === category.key;
          return <button key={category.key} type="button" aria-pressed={active} onClick={() => setActiveCategory(category.key)} className={`flex min-w-20.5 flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition-all duration-200 ${active ? 'border-brand bg-brand-tint text-brand-dark shadow-card' : 'border-transparent bg-surface text-ink-soft shadow-card hover:border-brand/30 hover:shadow-raised'}`}><span className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${active ? 'bg-brand text-white shadow-brand' : 'bg-brand-surface text-brand'}`}><Icon size={20} /></span><span className="text-[11px] font-bold leading-tight">{t(category.ar, category.en)}</span></button>;
        })}
        </div>
        <div className="mt-3 flex gap-2" aria-label="Store availability filter">
          {([['all', t('الكل', 'All')], ['open', t('مفتوح', 'Open')], ['closed', t('مغلق', 'Closed')]] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setAvailabilityFilter(value)} aria-pressed={availabilityFilter === value} className={`rounded-full px-3 py-1.5 text-micro font-bold ${availabilityFilter === value ? 'bg-brand text-white' : 'bg-surface text-ink-muted shadow-card'}`}>{label}</button>
          ))}
        </div>
      </section>

      {/* Store Ads & Offers Feed */}
      <section className="mx-auto max-w-md px-5 pt-7" aria-labelledby="offers-title">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="offers-title" className="text-lg font-extrabold">{t('عروض وإعلانات المتاجر', 'Store offers & ads')}</h2>
        </div>
        {offers.loading ? (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {[0, 1, 2].map(index => (
              <div key={index} className="skeleton min-w-55 overflow-hidden rounded-2xl shadow-card" aria-hidden="true">
                <div className="h-28 bg-line-soft" />
                <div className="space-y-2 p-3">
                  <div className="ms-auto h-3 w-2/3 rounded bg-line-soft" />
                  <div className="ms-auto h-2.5 w-1/2 rounded bg-line-soft" />
                </div>
              </div>
            ))}
          </div>
        ) : activeOffers.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {activeOffers.map((offer) => (
              <Link
                key={offer.id}
                to={`/stores/${encodeURIComponent(offer.storeId)}`}
                className="min-w-55 overflow-hidden rounded-2xl bg-surface shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised focus:outline-none focus:ring-2 focus:ring-brand/40"
              >
                {offer.imageUrl ? (
                  <img
                    src={offer.imageUrl}
                    alt=""
                    className="h-28 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-28 items-center justify-center bg-linear-to-br from-brand/10 to-brand/5">
                    <Star size={28} className="text-brand/30" />
                  </div>
                )}
                <div className="p-3 text-end">
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
      </section>

      {stores.error && <section className="mx-auto max-w-md px-5 pt-8" aria-live="assertive">
          <div className="rounded-2xl border border-danger-tint bg-surface p-5 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink"><AlertTriangle size={22} /></span>
            <h2 className="mt-3 text-sm font-extrabold">{t('تعذّر تحميل المتاجر', 'Could not load stores')}</h2>
            <p className="mt-2 text-xs text-ink-soft">{isArabic ? stores.error.message : stores.error.localizedMessage}</p>
            <p className="mt-2 text-micro break-all text-ink-muted" dir="ltr">Failed URL: {API_URL}/stores</p>
            <button type="button" onClick={stores.refresh} disabled={stores.refreshing} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60">
              {stores.refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {t('إعادة المحاولة', 'Retry')}
            </button>
          </div>
        </section>}

      {showEmpty && <section className="mx-auto max-w-md px-5 pt-8" aria-live="polite">
          <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand"><StoreIcon size={22} /></span>
            <h2 className="mt-3 text-sm font-extrabold">{t(debouncedSearch ? 'لا توجد نتائج مطابقة' : 'لا توجد متاجر متاحة حالياً', debouncedSearch ? 'No matching stores' : 'No stores available yet')}</h2>
          </div>
        </section>}

      {!stores.error && (stores.loading || featured.length > 0) && <section className="mx-auto max-w-md px-5 pt-8" aria-labelledby="featured-title" aria-busy={stores.loading}>
        <div className="mb-4 flex items-end justify-between"><div><h2 id="featured-title" className="text-lg font-extrabold">{t('المتاجر المميزة', 'Featured stores')}</h2></div><button type="button" onClick={() => document.getElementById('nearby-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="text-xs font-bold text-brand">{t('عرض الكل', 'See all')}</button></div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
          {stores.loading
            ? [0, 1, 2].map(index => <div key={index} className="skeleton min-w-49 overflow-hidden rounded-2xl shadow-card" aria-hidden="true"><div className="h-24 bg-line-soft" /><div className="space-y-2 p-3"><div className="ms-auto h-3 w-2/3 rounded bg-line-soft" /><div className="ms-auto h-2.5 w-1/2 rounded bg-line-soft" /><div className="h-5 w-20 rounded-full bg-line-soft" /></div></div>)
            : featured.map(({ store, category, initials, gradient }) => (
                <Link key={store.id} to={`/stores/${encodeURIComponent(store.id)}`} className="min-w-49 overflow-hidden rounded-2xl bg-surface shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised focus:outline-none focus:ring-2 focus:ring-brand/40" aria-label={t(`فتح متجر ${store.nameAr}`, `Open store ${store.nameEn}`)}>
                  <article>
                    <div className={`relative flex h-24 items-center justify-center bg-linear-to-br ${gradient}`}>
                      {store.logoUrl ? <ImageWithFallback src={store.logoUrl} alt="" className="h-full w-full object-cover" fallbackText={initials} /> : <span className="text-3xl font-black text-white/40">{initials}</span>}
                      {store.isRecommended && <span className="absolute inset-s-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-1 text-micro font-bold text-white shadow-card" title={t('ينصح به لدينا', 'Recommended by us')}><Star size={10} fill="currentColor" />{t('موصى به', 'Recommended')}</span>}
                      {store.badges?.includes('badge_popular') && <span className="absolute inset-e-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-micro font-bold text-white shadow-card" title={t('الأكثر طلباً', 'Most popular')}><Flame size={9} />{t('الأكثر طلباً', 'Popular')}</span>}
                      {store.badges?.includes('badge_fast') && <span className="absolute inset-e-2 top-10 inline-flex items-center gap-0.5 rounded-full bg-blue-500 px-1.5 py-0.5 text-micro font-bold text-white shadow-card" title={t('سريع التجهيز', 'Fast prep')}><Zap size={9} />{t('سريع', 'Fast')}</span>}
                      {store.badges?.includes('badge_has_offers') && <span className="absolute inset-e-2 top-17 inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-micro font-bold text-white shadow-card" title={t('عرض حصري', 'Special offer')}><Tag size={9} />{t('عرض', 'Offer')}</span>}
                      <span className={`absolute inset-s-2 bottom-2 rounded-full px-2 py-1 text-micro font-bold ${store.isActive ? 'bg-surface text-brand-dark' : 'bg-canvas text-ink-muted'}`}>{store.isActive ? t('مفتوح', 'Open') : t('مغلق', 'Closed')}</span>
                      <button type="button" aria-label={t(`إضافة ${store.nameAr} إلى المفضلة`, `Favorite ${store.nameEn}`)} aria-pressed={favorites.isFavorite(store.id)} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleLike(store.id); }} disabled={favorites.pending.includes(store.id)} className="absolute inset-e-2 top-2 rounded-full bg-surface/85 p-2 text-brand"><Heart size={15} fill={favorites.isFavorite(store.id) ? 'currentColor' : 'none'} /></button>
                    </div>
                    <div className="p-3 text-end">
                      <h3 className="truncate text-sm font-extrabold">{t(store.nameAr, store.nameEn)}</h3>
                      <p className="mt-2 text-micro text-ink-muted">{t(category.ar, category.en)}</p>
                      <div className="mt-2 flex items-center justify-between gap-2"><span className="flex items-center gap-1"><DeliveryFee amount={baseFee} variant="badge" showIcon /></span></div>
                    </div>
                  </article>
                </Link>
              ))}
        </div>
      </section>}

      {/* Popular Products Section */}
      {(!popular.loading || (popular.data ?? []).length > 0) && (
        <section className="mx-auto max-w-md px-5 pt-8" aria-labelledby="popular-title" aria-busy={popular.loading}>
          <div className="mb-4 flex items-end justify-between">
            <h2 id="popular-title" className="text-lg font-extrabold">{t('الأكثر مبيعاً', 'Best sellers')}</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {popular.loading
              ? [0, 1, 2, 3].map(i => (
                  <div key={i} className="skeleton min-w-37.5 overflow-hidden rounded-2xl shadow-card" aria-hidden="true">
                    <div className="h-32 bg-line-soft" />
                    <div className="space-y-2 p-3"><div className="h-3 w-2/3 rounded bg-line-soft" /><div className="h-2.5 w-1/2 rounded bg-line-soft" /><div className="h-5 w-16 rounded-full bg-line-soft" /></div>
                  </div>
                ))
              : (popular.data ?? []).map((product) => (
                  <article
                    key={product.id}
                    className="group relative flex min-w-42 flex-col justify-between overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
                  >
                    {/* Product image */}
                    <div className="relative aspect-4/3 overflow-hidden bg-slate-100">
                      {product.imageUrl ? (
                        <ImageWithFallback src={product.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" fallbackText={product.nameAr.slice(0, 2)} />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-2xl font-black text-brand-dark/30">{product.nameAr.slice(0, 2)}</span>
                      )}
                      {/* Store name badge */}
                      <span className="absolute inset-e-2 bottom-2 rounded-full bg-surface/90 px-2 py-0.5 text-micro font-bold text-ink shadow-card">{product.storeNameAr}</span>
                    </div>
                    {/* Text & Price */}
                    <div className="p-3 text-end">
                      <h3 className="line-clamp-2 min-h-8 text-sm font-bold text-ink">{product.nameAr}</h3>
                      <p className="mt-1 text-base font-extrabold text-emerald-700" dir="ltr">{formatCurrency(product.price)}</p>
                      <div className="mt-2 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => handlePopularAdd(product)}
                          className="min-h-9 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20 transition-colors hover:bg-emerald-600 hover:text-white active:scale-95"
                          aria-label={`أضف ${product.nameAr} إلى السلة`}
                        >
                          {product.hasOptions ? t('تخصيص', 'Customize') : t('إضافة', 'Add')}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
          </div>
        </section>
      )}

      {/* Product Options Sheet (for popular products with addons) */}
      {optionsProduct && (
        <ProductOptionsSheet
          product={{
            id: optionsProduct.id,
            nameAr: optionsProduct.nameAr,
            description: optionsProduct.description,
            price: optionsProduct.price,
            imageUrl: optionsProduct.imageUrl,
            isAvailable: optionsProduct.isAvailable,
            categoryId: null,
            storeId: optionsProduct.storeId,
            optionGroups: optionsProduct.optionGroups,
          } as any}
          storeNameAr={optionsProduct.storeNameAr}
          onClose={() => setOptionsProduct(null)}
          onConfirm={handlePopularOptionsConfirm}
        />
      )}

      {!stores.error && (stores.loading || cards.length > 0) && <section id="home-results" aria-live="polite" className="mx-auto max-w-md px-5 pt-8" aria-labelledby="nearby-title" aria-busy={stores.loading}>
        <div className="mb-4 flex items-end justify-between"><div><h2 id="nearby-title" className="text-lg font-extrabold">{t('كل المتاجر', "All stores in Al-Samou'")}</h2></div>{stores.refreshing ? <Loader2 size={16} className="animate-spin text-brand" aria-label="Refreshing" /> : <ChevronLeft size={18} className="text-ink-subtle" />}</div>
        <div className="space-y-3">
          {stores.loading
            ? [0, 1, 2].map(index => <div key={index} className="skeleton flex items-center gap-3 rounded-2xl p-3 shadow-card" aria-hidden="true"><div className="h-12 w-12 shrink-0 rounded-xl bg-line-soft" /><div className="flex-1 space-y-2"><div className="ms-auto h-3 w-1/2 rounded bg-line-soft" /><div className="ms-auto h-2.5 w-2/3 rounded bg-line-soft" /></div><div className="h-6 w-12 shrink-0 rounded-full bg-line-soft" /></div>)
            : cards.map(({ store, category, initials, tint }) => (
                <Link key={store.id} to={`/stores/${encodeURIComponent(store.id)}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card transition-all duration-200 hover:-translate-y-px hover:shadow-raised focus:outline-none focus:ring-2 focus:ring-brand/40" aria-label={t(`فتح متجر ${store.nameAr}`, `Open store ${store.nameEn}`)}>
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-black ${tint}`}>{store.logoUrl ? <ImageWithFallback src={store.logoUrl} alt="" className="h-full w-full object-cover" fallbackText={initials} /> : initials}</div>
                  <div className="min-w-0 flex-1 text-end"><h3 className="truncate text-sm font-extrabold">{t(store.nameAr, store.nameEn)}{store.isRecommended && <span className="ms-1.5 inline-flex items-center gap-0.5 rounded-full bg-brand-tint px-1.5 py-0.5 align-middle text-micro font-bold text-brand-deep" title={t('ينصح به لدينا', 'Recommended by us')}><Star size={9} fill="currentColor" />{t('موصى به', 'Recommended')}</span>}</h3><p className="mt-1 flex items-center gap-2 text-micro font-semibold text-ink-muted"><DeliveryFee amount={baseFee} variant="inline" /></p></div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-micro font-bold ${store.isActive ? 'bg-brand-tint text-brand-dark' : 'bg-canvas text-ink-muted'}`}>{store.isActive ? t('مفتوح', 'Open') : t('مغلق', 'Closed')}</span>
                </Link>
              ))}
        </div>
      </section>}

      <BottomNav />
      <SupportWhatsAppButton />
    </main>;
}
