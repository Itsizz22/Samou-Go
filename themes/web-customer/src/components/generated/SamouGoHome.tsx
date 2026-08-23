import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  Coffee,
  Heart,
  LayoutGrid,
  Loader2,
  MapPin,
  Menu,
  MessageSquarePlus,
  Pill,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store as StoreIcon,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { NotificationBell, useLanguage, type BellNotification } from '@samou-go/ui';
import { BottomNav } from '@/components/BottomNav';
import { useDrawer } from '@/components/NavigationDrawer';
import { DeliveryFee } from '@samou-go/ui';
import { API_URL } from '@/hooks/useApi';
import { useApiMeta, useOrders, useStores, useAuth } from '@/hooks/useApi';
import { useFavorites } from '@/components/FavoritesProvider';
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
  supermarket: ShoppingBag,
  pharmacy: Pill,
  cafe: Coffee,
  shop: StoreIcon,
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
  const [banner, setBanner] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'open' | 'closed'>('all');
  // The category chip rail is collapsible on phones (thin screens); it stays
  // permanently expanded on wider viewports where horizontal scroll is usable.
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);

  // Auto-rotate the banner carousel every 5 seconds.
  useEffect(() => {
    const timer = setInterval(() => {
      setBanner(prev => (prev === 0 ? 1 : 0));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

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

  return <main className="min-h-screen bg-canvas pb-24 text-ink">
      <header className="bg-brand px-5 pb-6 pt-4 text-white safe-top">
        <nav className="mx-auto flex max-w-md items-center justify-between" aria-label="Main navigation">
          <button
            type="button"
            aria-label={t('القائمة', 'Menu')}
            onClick={openDrawer}
            className="rounded-full p-2 transition hover:bg-surface/15"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2" dir="ltr">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-brand"><ShoppingCart size={19} strokeWidth={2.5} /></span>
            <span className="text-[17px] font-bold tracking-tight">Samou' Go</span>
          </div>
          <div className="flex items-center gap-1" dir="ltr">
            <NotificationBell
              notifications={bellNotifications}
              storageKey="customer"
              onDark
              onNavigate={(href) => { navigate(href); }}
            />
            <Link
              to="/cart"
              aria-label="Cart"
              className="relative rounded-full p-2 transition hover:bg-surface/15"
            >
              <ShoppingCart size={20} />
            </Link>
          </div>
        </nav>
        <section className="mx-auto mt-5 flex max-w-md items-end justify-between" aria-label="Location and greeting">
          <div className="flex items-center gap-2 text-end"><MapPin size={18} /><div><p className="text-sm font-semibold">{t('السموع، الخليل', "Al-Samou', Hebron")}</p></div></div>
          <div className="text-start"><p className="text-lg font-bold">{t('مرحباً! 👋', 'Hello! 👋')}</p></div>
        </section>
      </header>

      <section className="mx-auto max-w-md px-5" role="search" aria-label="Search">
        <label className="-mt-6 flex h-[52px] cursor-text items-center gap-3 rounded-2xl bg-surface px-4 text-ink-muted shadow-raised transition-all duration-200 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
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

      {/* Multi-banner carousel */}
      <section className="mx-auto max-w-md px-5 pt-5" aria-label="Feature banners">
        <div className="relative overflow-hidden rounded-2xl shadow-card">
          {/* Banner container with smooth transition */}
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(${banner === 0 ? '0%' : '-100%'})` }}
          >
            {/* Banner 1 — Multi-Vendor Cart */}
            <div className="min-w-full rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-400 to-teal-400 px-5 py-6 text-white">
              <div className="flex min-h-[100px] items-center justify-between">
                <div className="flex-1 text-end">
                  <p className="mb-1 text-xs font-medium text-white/80">{t('اطلب من عدة متاجر', 'Order from multiple stores')}</p>
                  <h2 className="text-[20px] font-extrabold leading-tight">{t('سلة مشتركة.. فاتورة واحدة', 'Shared cart.. one invoice')}</h2>
                </div>
                {/* Cart icon with store boxes */}
                <div className="ms-4 shrink-0">
                  <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                    <circle cx="40" cy="40" r="36" fill="rgba(255,255,255,0.15)" />
                    {/* Cart body */}
                    <path d="M20 28h8l4 20h24l4-16H28" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    {/* Wheels */}
                    <circle cx="33" cy="52" r="3" fill="white" />
                    <circle cx="49" cy="52" r="3" fill="white" />
                    {/* Store box 1 */}
                    <rect x="30" y="20" width="10" height="12" rx="2" fill="rgba(255,255,255,0.85)" />
                    <text x="35" y="28" textAnchor="middle" fontSize="7" fill="#059669">🏪</text>
                    {/* Store box 2 */}
                    <rect x="42" y="16" width="10" height="14" rx="2" fill="rgba(255,255,255,0.85)" />
                    <text x="47" y="26" textAnchor="middle" fontSize="7" fill="#059669">🍞</text>
                  </svg>
                </div>
              </div>
            </div>
            {/* Banner 2 — Post-Checkout Tracking */}
            <div className="min-w-full rounded-2xl bg-gradient-to-br from-teal-500 via-emerald-500 to-green-400 px-5 py-6 text-white">
              <div className="flex min-h-[100px] items-center justify-between">
                <div className="flex-1 text-end">
                  <p className="mb-1 text-xs font-medium text-white/80">{t('العودة للصفحة الرئيسية', 'Back to home page')}</p>
                  <h2 className="text-[20px] font-extrabold leading-tight">{t('تابع طلبك مباشرة', 'Track your order live')}</h2>
                </div>
                {/* Map pin with tracking path */}
                <div className="ms-4 shrink-0">
                  <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                    <circle cx="40" cy="40" r="36" fill="rgba(255,255,255,0.15)" />
                    {/* Winding path */}
                    <path d="M25 55 Q30 45 35 50 Q42 56 45 42 Q48 32 55 28" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" fill="none" />
                    {/* Map pin */}
                    <circle cx="55" cy="24" r="8" fill="white" />
                    <circle cx="55" cy="24" r="4" fill="#059669" />
                    <path d="M55 32 L52 26 L58 26 Z" fill="white" />
                    {/* Start dot */}
                    <circle cx="25" cy="55" r="4" fill="white" opacity="0.8" />
                    <circle cx="25" cy="55" r="2" fill="#059669" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Pagination dots + swipe hint */}
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            {[0, 1].map(i => (
              <button
                key={i}
                type="button"
                aria-label={i === 0 ? 'Multi-vendor banner' : 'Tracking banner'}
                onClick={() => setBanner(i)}
                className="-m-2.5 p-2.5"
              >
                <span className={`block h-1.5 rounded-full transition-all ${banner === i ? 'w-6 bg-brand' : 'w-1.5 bg-brand-tint'}`} />
              </button>
            ))}
          </div>
          <p className="text-[10px] text-ink-subtle">{t('سحب لليمين', 'Swipe right')}</p>
        </div>
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
          className={`${categoriesCollapsed ? 'hidden md:flex' : 'flex'} gap-3 overflow-x-auto pb-1`}
        >
          {STORE_CATEGORIES.map(category => {
          const Icon = CATEGORY_ICONS[category.key];
          const active = activeCategory === category.key;
          return <button key={category.key} type="button" aria-pressed={active} onClick={() => setActiveCategory(category.key)} className={`flex min-w-[82px] flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition-all duration-200 ${active ? 'border-brand bg-brand-tint text-brand-dark shadow-card' : 'border-transparent bg-surface text-ink-soft shadow-card hover:border-brand/30 hover:shadow-raised'}`}><span className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${active ? 'bg-brand text-white shadow-brand' : 'bg-brand-surface text-brand'}`}><Icon size={20} /></span><span className="text-[11px] font-bold leading-tight">{t(category.ar, category.en)}</span></button>;
        })}
        </div>
        <div className="mt-3 flex gap-2" aria-label="Store availability filter">
          {([['all', t('الكل', 'All')], ['open', t('مفتوح', 'Open')], ['closed', t('مغلق', 'Closed')]] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setAvailabilityFilter(value)} aria-pressed={availabilityFilter === value} className={`rounded-full px-3 py-1.5 text-micro font-bold ${availabilityFilter === value ? 'bg-brand text-white' : 'bg-surface text-ink-muted shadow-card'}`}>{label}</button>
          ))}
        </div>
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
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stores.loading
            ? [0, 1, 2].map(index => <div key={index} className="skeleton min-w-[196px] overflow-hidden rounded-2xl shadow-card" aria-hidden="true"><div className="h-24 bg-line-soft" /><div className="space-y-2 p-3"><div className="ms-auto h-3 w-2/3 rounded bg-line-soft" /><div className="ms-auto h-2.5 w-1/2 rounded bg-line-soft" /><div className="h-5 w-20 rounded-full bg-line-soft" /></div></div>)
            : featured.map(({ store, category, initials, gradient }) => (
                <Link key={store.id} to={`/stores/${encodeURIComponent(store.id)}`} className="min-w-[196px] overflow-hidden rounded-2xl bg-surface shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised focus:outline-none focus:ring-2 focus:ring-brand/40" aria-label={t(`فتح متجر ${store.nameAr}`, `Open store ${store.nameEn}`)}>
                  <article>
                    <div className={`relative flex h-24 items-center justify-center bg-gradient-to-br ${gradient}`}>
                      {store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="text-3xl font-black text-white/40">{initials}</span>}
                      {store.isRecommended && <span className="absolute top-2 start-2 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-1 text-micro font-bold text-white shadow-card" title={t('ينصح به لدينا', 'Recommended by us')}><Star size={10} fill="currentColor" />{t('موصى به', 'Recommended')}</span>}
                      <span className={`absolute bottom-2 start-2 rounded-full px-2 py-1 text-micro font-bold ${store.isActive ? 'bg-surface text-brand-dark' : 'bg-canvas text-ink-muted'}`}>{store.isActive ? t('مفتوح', 'Open') : t('مغلق', 'Closed')}</span>
                      <button type="button" aria-label={t(`إضافة ${store.nameAr} إلى المفضلة`, `Favorite ${store.nameEn}`)} aria-pressed={favorites.isFavorite(store.id)} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleLike(store.id); }} disabled={favorites.pending.includes(store.id)} className="absolute end-2 top-2 rounded-full bg-surface/85 p-2 text-brand"><Heart size={15} fill={favorites.isFavorite(store.id) ? 'currentColor' : 'none'} /></button>
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

      {!stores.error && (stores.loading || cards.length > 0) && <section id="home-results" aria-live="polite" className="mx-auto max-w-md px-5 pt-8" aria-labelledby="nearby-title" aria-busy={stores.loading}>
        <div className="mb-4 flex items-end justify-between"><div><h2 id="nearby-title" className="text-lg font-extrabold">{t('كل المتاجر', "All stores in Al-Samou'")}</h2></div>{stores.refreshing ? <Loader2 size={16} className="animate-spin text-brand" aria-label="Refreshing" /> : <ChevronLeft size={18} className="text-ink-subtle" />}</div>
        <div className="space-y-3">
          {stores.loading
            ? [0, 1, 2].map(index => <div key={index} className="skeleton flex items-center gap-3 rounded-2xl p-3 shadow-card" aria-hidden="true"><div className="h-12 w-12 shrink-0 rounded-xl bg-line-soft" /><div className="flex-1 space-y-2"><div className="ms-auto h-3 w-1/2 rounded bg-line-soft" /><div className="ms-auto h-2.5 w-2/3 rounded bg-line-soft" /></div><div className="h-6 w-12 shrink-0 rounded-full bg-line-soft" /></div>)
            : cards.map(({ store, category, initials, tint }) => (
                <Link key={store.id} to={`/stores/${encodeURIComponent(store.id)}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card transition-all duration-200 hover:-translate-y-px hover:shadow-raised focus:outline-none focus:ring-2 focus:ring-brand/40" aria-label={t(`فتح متجر ${store.nameAr}`, `Open store ${store.nameEn}`)}>
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-black ${tint}`}>{store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials}</div>
                  <div className="min-w-0 flex-1 text-end"><h3 className="truncate text-sm font-extrabold">{t(store.nameAr, store.nameEn)}{store.isRecommended && <span className="ms-1.5 inline-flex items-center gap-0.5 rounded-full bg-brand-tint px-1.5 py-0.5 align-middle text-micro font-bold text-brand-deep" title={t('ينصح به لدينا', 'Recommended by us')}><Star size={9} fill="currentColor" />{t('موصى به', 'Recommended')}</span>}</h3><p className="mt-1 flex items-center gap-2 text-micro font-semibold text-ink-muted"><DeliveryFee amount={baseFee} variant="inline" /></p></div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-micro font-bold ${store.isActive ? 'bg-brand-tint text-brand-dark' : 'bg-canvas text-ink-muted'}`}>{store.isActive ? t('مفتوح', 'Open') : t('مغلق', 'Closed')}</span>
                </Link>
              ))}
        </div>
      </section>}

      <BottomNav />
    </main>;
}
