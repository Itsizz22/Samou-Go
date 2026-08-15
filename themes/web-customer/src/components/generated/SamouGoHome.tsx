import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  Coffee,
  Heart,
  LayoutGrid,
  Loader2,
  MapPin,
  Menu,
  Pill,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store as StoreIcon,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { NotificationBell, type BellNotification } from '@samou-go/ui';
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
  const [activeCategory, setActiveCategory] = useState<StoreCategoryKey>('all');
  const [banner, setBanner] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'open' | 'closed'>('all');

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
  // free-delivery badge cannot drift from `calculateDeliveryFee`.
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
      <header className="bg-brand px-5 pb-5 pt-4 text-white">
        <nav className="mx-auto flex max-w-md items-center justify-between" aria-label="Main navigation">
          <button
            type="button"
            aria-label="القائمة / Menu"
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
          <div className="flex items-center gap-2 text-end"><MapPin size={18} /><div><p className="text-sm font-semibold">السموع، الخليل</p><p className="text-[11px] text-white/80" dir="ltr">Al-Samou', Hebron</p></div></div>
          <div className="text-start"><p className="text-lg font-bold">مرحباً! 👋</p><p className="text-xs text-white/80" dir="ltr">Hello!</p></div>
        </section>
      </header>

      <section className="mx-auto max-w-md px-5" role="search" aria-label="Search">
        <label className="-mt-6 flex h-14 cursor-text items-center gap-3 rounded-2xl bg-surface px-4 text-ink-muted shadow-raised">
          <Search size={20} className="text-brand" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} enterKeyHint="search" aria-controls="home-results" onKeyDown={event => { if (event.key === 'Enter') setDebouncedSearch(searchTerm.trim()); }} className="w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle" placeholder="ابحث عن متاجر أو منتجات / Search stores or products…" aria-label="Search stores or products" />
          {stores.refreshing && <Loader2 size={16} className="shrink-0 animate-spin text-brand" aria-label="Searching" />}
        </label>
      </section>

      <section className="mx-auto max-w-md px-5 pt-6" aria-label="Promotions">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-brand-dark to-brand-soft px-5 py-5 text-white shadow-card">
          <div className="relative z-10 flex min-h-[104px] items-center justify-between">
            <div><p className="mb-2 text-xs font-medium text-white/85">عرض خاص لفترة محدودة</p><h2 className="max-w-[220px] text-[22px] font-extrabold leading-tight">{banner === 0 ? 'توصيل مجاني لأول طلب' : 'متاجر جديدة في السموع!'}</h2><p className="mt-2 text-xs font-medium text-white/85" dir="ltr">{banner === 0 ? 'Free delivery on your first order!' : "New stores in Al-Samou'!"}</p></div><span className="text-5xl opacity-20">{banner === 0 ? '✦' : '✚'}</span>
          </div>
          <div className="absolute -bottom-10 -start-8 h-32 w-32 rounded-full border-[18px] border-white/10" />
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5"><button type="button" aria-label="Promotion one" onClick={() => setBanner(0)} className={`h-1.5 rounded-full transition-all ${banner === 0 ? 'w-6 bg-brand' : 'w-1.5 bg-brand-tint'}`} /><button type="button" aria-label="Promotion two" onClick={() => setBanner(1)} className={`h-1.5 rounded-full transition-all ${banner === 1 ? 'w-6 bg-brand' : 'w-1.5 bg-brand-tint'}`} /></div>
      </section>

      <section className="mx-auto max-w-md px-5 pt-7" aria-labelledby="categories-title">
        <div className="mb-4 flex items-end justify-between"><div><h2 id="categories-title" className="text-lg font-extrabold">الفئات</h2><p className="text-xs text-ink-muted" dir="ltr">Categories</p></div><ChevronLeft size={18} className="text-ink-subtle" /></div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {STORE_CATEGORIES.map(category => {
          const Icon = CATEGORY_ICONS[category.key];
          const active = activeCategory === category.key;
          return <button key={category.key} type="button" aria-pressed={active} onClick={() => setActiveCategory(category.key)} className={`flex min-w-[82px] flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition ${active ? 'border-brand bg-brand-tint text-brand-dark' : 'border-transparent bg-surface text-ink-soft shadow-card'}`}><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? 'bg-brand text-white' : 'bg-brand-surface text-brand'}`}><Icon size={20} /></span><span className="text-[11px] font-bold leading-tight">{category.ar}</span><span className="text-[10px]" dir="ltr">{category.en}</span></button>;
        })}
        </div>
        <div className="mt-3 flex gap-2" aria-label="Store availability filter">
          {([['all', 'الكل / All'], ['open', 'مفتوح / Open'], ['closed', 'مغلق / Closed']] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setAvailabilityFilter(value)} aria-pressed={availabilityFilter === value} className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${availabilityFilter === value ? 'bg-brand text-white' : 'bg-surface text-ink-muted shadow-card'}`}>{label}</button>
          ))}
        </div>
      </section>

      {stores.error && <section className="mx-auto max-w-md px-5 pt-8" aria-live="assertive">
          <div className="rounded-2xl border border-danger-tint bg-surface p-5 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink"><AlertTriangle size={22} /></span>
            <h2 className="mt-3 text-sm font-extrabold">تعذّر تحميل المتاجر</h2>
            <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">Could not load stores</p>
            <p className="mt-2 text-xs text-ink-soft">{stores.error.message}</p>
            <p className="mt-2 text-[10px] break-all text-ink-subtle" dir="ltr">Failed URL: {API_URL}/stores</p>
            <button type="button" onClick={stores.refresh} disabled={stores.refreshing} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60">
              {stores.refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              إعادة المحاولة <span dir="ltr">Retry</span>
            </button>
          </div>
        </section>}

      {showEmpty && <section className="mx-auto max-w-md px-5 pt-8" aria-live="polite">
          <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand"><StoreIcon size={22} /></span>
            <h2 className="mt-3 text-sm font-extrabold">{debouncedSearch ? 'لا توجد نتائج مطابقة' : 'لا توجد متاجر متاحة حالياً'}</h2>
            <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">{debouncedSearch ? 'No matching stores' : 'No stores available yet'}</p>
          </div>
        </section>}

      {!stores.error && (stores.loading || featured.length > 0) && <section className="mx-auto max-w-md px-5 pt-8" aria-labelledby="featured-title" aria-busy={stores.loading}>
        <div className="mb-4 flex items-end justify-between"><div><h2 id="featured-title" className="text-lg font-extrabold">المتاجر المميزة</h2><p className="text-xs text-ink-muted" dir="ltr">Featured Stores</p></div><button type="button" onClick={() => document.getElementById('nearby-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="text-xs font-bold text-brand">عرض الكل <span dir="ltr">See all</span></button></div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stores.loading
            ? [0, 1, 2].map(index => <div key={index} className="min-w-[196px] animate-pulse overflow-hidden rounded-2xl bg-surface shadow-card" aria-hidden="true"><div className="h-24 bg-line-soft" /><div className="space-y-2 p-3"><div className="ms-auto h-3 w-2/3 rounded bg-line-soft" /><div className="ms-auto h-2.5 w-1/2 rounded bg-line-soft" /><div className="h-5 w-20 rounded-full bg-line-soft" /></div></div>)
            : featured.map(({ store, category, initials, gradient }) => (
                <Link key={store.id} to={`/stores/${encodeURIComponent(store.id)}`} className="min-w-[196px] overflow-hidden rounded-2xl bg-surface shadow-card transition hover:shadow-raised focus:outline-none focus:ring-2 focus:ring-brand/40" aria-label={`فتح متجر ${store.nameAr}`}>
                  <article>
                    <div className={`relative flex h-24 items-center justify-center bg-gradient-to-br ${gradient}`}>
                      {store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="text-3xl font-black text-white/40">{initials}</span>}
                      <span className={`absolute bottom-2 start-2 rounded-full px-2 py-1 text-[10px] font-bold ${store.isActive ? 'bg-surface text-brand-dark' : 'bg-canvas text-ink-muted'}`}>{store.isActive ? <>مفتوح <span dir="ltr">Open</span></> : <>مغلق <span dir="ltr">Closed</span></>}</span>
                      <button type="button" aria-label={`Favorite ${store.nameEn}`} aria-pressed={favorites.isFavorite(store.id)} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleLike(store.id); }} disabled={favorites.pending.includes(store.id)} className="absolute end-2 top-2 rounded-full bg-surface/85 p-1.5 text-brand"><Heart size={15} fill={favorites.isFavorite(store.id) ? 'currentColor' : 'none'} /></button>
                    </div>
                    <div className="p-3 text-end">
                      <h3 className="truncate text-sm font-extrabold">{store.nameAr}</h3>
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted" dir="ltr">{store.nameEn}</p>
                      <p className="mt-2 text-[10px] text-ink-muted">{category.ar}</p>
                      <div className="mt-2 flex items-center justify-between gap-2"><span className="flex items-center gap-1"><DeliveryFee amount={baseFee} variant="badge" showIcon /></span><span className="truncate text-[10px] text-ink-muted" dir="ltr">{category.en}</span></div>
                    </div>
                  </article>
                </Link>
              ))}
        </div>
      </section>}

      {!stores.error && (stores.loading || cards.length > 0) && <section id="home-results" aria-live="polite" className="mx-auto max-w-md px-5 pt-8" aria-labelledby="nearby-title" aria-busy={stores.loading}>
        <div className="mb-4 flex items-end justify-between"><div><h2 id="nearby-title" className="text-lg font-extrabold">كل المتاجر</h2><p className="text-xs text-ink-muted" dir="ltr">All stores in Al-Samou'</p></div>{stores.refreshing ? <Loader2 size={16} className="animate-spin text-brand" aria-label="Refreshing" /> : <ChevronLeft size={18} className="text-ink-subtle" />}</div>
        <div className="space-y-3">
          {stores.loading
            ? [0, 1, 2].map(index => <div key={index} className="flex animate-pulse items-center gap-3 rounded-2xl bg-surface p-3 shadow-card" aria-hidden="true"><div className="h-12 w-12 shrink-0 rounded-xl bg-line-soft" /><div className="flex-1 space-y-2"><div className="ms-auto h-3 w-1/2 rounded bg-line-soft" /><div className="ms-auto h-2.5 w-2/3 rounded bg-line-soft" /></div><div className="h-6 w-12 shrink-0 rounded-full bg-line-soft" /></div>)
            : cards.map(({ store, category, initials, tint }) => (
                <Link key={store.id} to={`/stores/${encodeURIComponent(store.id)}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card transition hover:shadow-raised focus:outline-none focus:ring-2 focus:ring-brand/40" aria-label={`فتح متجر ${store.nameAr}`}>
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-black ${tint}`}>{store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials}</div>
                  <div className="min-w-0 flex-1 text-end"><h3 className="truncate text-sm font-extrabold">{store.nameAr}</h3><p className="truncate text-[11px] text-ink-muted" dir="ltr">{store.nameEn} · {category.en}</p><p className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-ink-muted"><DeliveryFee amount={baseFee} variant="inline" /></p></div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${store.isActive ? 'bg-brand-tint text-brand-dark' : 'bg-canvas text-ink-muted'}`}>{store.isActive ? 'مفتوح' : 'مغلق'}</span>
                </Link>
              ))}
        </div>
      </section>}

      <BottomNav />
    </main>;
}
