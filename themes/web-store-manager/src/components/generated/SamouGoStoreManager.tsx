/**
 * Samou' Go — store manager dashboard.
 *
 * Reads incoming orders from `GET /orders` filtered by status, and drives each
 * one through the state machine with `PATCH /orders/:id/status`. KPIs and the
 * recent-activity strip are derived from the same data — no hard-coded sample
 * numbers, no mock fixtures.
 *
 * The store manager owns the kitchen half of the lifecycle: ACCEPTED →
 * PREPARING → READY_FOR_PICKUP. ACCEPTING a PENDING order is the only edge
 * shown inline; the rest happen via the captain app. CANCELLED stays available
 * for any active order.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Home,
  Loader2,
  Menu,
  X,
  LogOut,
  MapPin,
  Megaphone,
  Package,
  PackageCheck,
  RefreshCw,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  StickyNote,
  Store,
  UtensilsCrossed,
  Phone,
} from 'lucide-react';
import {
  SignInGate,
  updateOrderStatus,
  updateStore,
  useAuth,
  useMutation,
  useMyStores,
  useOrders,
  useRoleRedirect,
  useStoreManager,
  useToast,
} from '@samou-go/api-client';
import { createLoopingAlert } from '@samou-go/ui';
import {
  LanguageToggle,
  NotificationBell,
  ThemeToggle,
  Badge,
  useLanguage,
  type BellNotification,
} from '@samou-go/ui';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  OrderStatus,
  UserRole,
  canRoleTransitionOrderStatus,
  type OrderDetail,
  type OrderSummary,
  type Store as StoreType,
  type UpdateOrderStatusInput,
  formatWhatsAppLink,
  WHATSAPP_MESSAGES,
} from '@samou-go/shared-types';
import { ProductCataloguePanel } from './ProductCataloguePanel';
import { CategoriesPanel } from './CategoriesPanel';
import { OffersPanel } from './OffersPanel';
import { StoreProfilePanel } from './StoreProfilePanel';
import { CustomRequestsPanel } from './CustomRequestsPanel';

/* ---------------------------------------------------------------------------
 * Presentation helpers
 * ------------------------------------------------------------------------- */

/** `"منذ 4 دقائق"` — short relative time in Arabic, English in `dir="ltr"`. */
function relativeTime(iso: string, now: number = Date.now()): { ar: string; en: string } {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return { ar: '', en: '' };
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return { ar: 'الآن', en: 'just now' };
  if (minutes < 60) return { ar: `منذ ${minutes} دقيقة`, en: `${minutes} min ago` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { ar: `منذ ${hours} ساعة`, en: `${hours} h ago` };
  const days = Math.floor(hours / 24);
  return { ar: `منذ ${days} يوم`, en: `${days} d ago` };
}

/* ---------------------------------------------------------------------------
 * Quick actions
 * ------------------------------------------------------------------------- */

const QUICK_ACTIONS = [
  { icon: ClipboardList, ar: 'إدارة القائمة', en: 'Manage Menu', tab: 'products' },
  { icon: Megaphone, ar: 'إدارة العروض', en: 'Manage Offers', tab: 'offers' },
  { icon: Settings, ar: 'إعدادات المتجر', en: 'Store Settings', tab: 'settings' },
  { icon: Package, ar: 'الطلبات النشطة', en: 'Active Orders', tab: 'orders' },
  { icon: BarChart3, ar: 'لوحة التحكم', en: 'Dashboard', tab: 'home' },
] as const;

const BOTTOM_TABS = [
  { id: 'home', icon: Home, ar: 'الرئيسية', en: 'Home' },
  { id: 'orders', icon: Package, ar: 'الطلبات', en: 'Orders' },
  { id: 'products', icon: ShoppingBag, ar: 'المنتجات', en: 'Products' },
  { id: 'offers', icon: Megaphone, ar: 'العروض', en: 'Offers' },
  { id: 'settings', icon: Settings, ar: 'إعدادات المتجر', en: 'Settings' },
  { id: 'custom-requests', icon: ClipboardList, ar: 'طلبات مخصصة', en: 'Requests' },
] as const;

/* ---------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------- */

export function SamouGoStoreManager() {
  const auth = useAuth({ allowedRoles: [UserRole.STORE_MANAGER] });
  const toast = useToast();
  const { t, language } = useLanguage();

  // Unified login: non-store-manager roles are sent to their own workspace.
  useRoleRedirect('store-manager');

  /* -- Role gate --------------------------------------------------------- */
  const isManager = auth.user?.role === UserRole.STORE_MANAGER;

  /* ---- Resolve the manager's store id ----------------------------------- */
  // `GET /stores/mine` is auth-gated and returns ONLY the manager's own
  // stores — the old trick of fetching the public catalogue with `pageSize: 1`
  // silently failed whenever the manager's store was not the first row
  // (alphabetical + open-first ordering), which blocked product creation.
  const managedStores = useMyStores({
    enabled: Boolean(auth.user) && isManager,
  });
  const managedStoreId: string | null = managedStores.data?.[0]?.id ?? null;
  const managedStore = useStoreManager(managedStoreId, { enabled: isManager });

  const [isOpen, setIsOpen] = useState(true);
  const [prepMinutes, setPrepMinutes] = useState(25);
  const [storeTogglePending, setStoreTogglePending] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuView, setMenuView] = useState<'products' | 'sections'>('products');
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  /** Operating hours state */
  const [openingTime, setOpeningTime] = useState<string>('');
  const [closingTime, setClosingTime] = useState<string>('');
  const [hoursPending, setHoursPending] = useState(false);

  /* -- /Role gate --------------------------------------------------------- */

  const handleToggleStore = async () => {
    if (!managedStoreId || storeTogglePending) return;
    const next = !isOpen;
    setIsOpen(next);
    setStoreTogglePending(true);
    try {
      await updateStore(managedStoreId, { isAcceptingOrders: next });
      toast.success(next ? 'تم فتح المتجر ✅' : 'تم إغلاق المتجر', next ? 'Store is now open' : 'Store is now closed');
    } catch (err) {
      setIsOpen(!next);
      toast.error('تعذّر تحديث حالة المتجر', err instanceof Error ? err.message : String(err));
    } finally {
      setStoreTogglePending(false);
    }
  };

  // Sync operating hours from the loaded store data
  useEffect(() => {
    if (managedStore.data) {
      setIsOpen(managedStore.data.isAcceptingOrders);
      setOpeningTime(managedStore.data.openingTime ?? '');
      setClosingTime(managedStore.data.closingTime ?? '');
    }
  }, [managedStore.data]);

  const handleSaveHours = async () => {
    if (!managedStoreId || hoursPending) return;
    setHoursPending(true);
    try {
      await updateStore(managedStoreId, {
        openingTime: openingTime || null,
        closingTime: closingTime || null,
      });
      toast.success('تم حفظ أوقات العمل', 'Operating hours saved');
      void managedStore.reload();
    } catch (err) {
      toast.error('تعذّر حفظ الأوقات', err instanceof Error ? err.message : String(err));
    } finally {
      setHoursPending(false);
    }
  };

  /* ---- Data -------------------------------------------------------------- */

  // The kitchen's inbox: anything not yet terminal and not yet on the road.
  // Polled every 10 s so a new PENDING order chimes without a manual refresh.
  const incoming = useOrders(
    { status: OrderStatus.PENDING, pageSize: 20 },
    { enabled: Boolean(auth.user) && isManager, pollMs: 10_000 }
  );
  const accepted = useOrders(
    { status: OrderStatus.ACCEPTED, pageSize: 20 },
    { enabled: Boolean(auth.user) && isManager, pollMs: 10_000 }
  );
  const preparing = useOrders(
    { status: OrderStatus.PREPARING, pageSize: 20 },
    { enabled: Boolean(auth.user) && isManager, pollMs: 10_000 }
  );
  const readyForPickup = useOrders(
    { status: OrderStatus.READY_FOR_PICKUP, pageSize: 20 },
    { enabled: Boolean(auth.user) && isManager, pollMs: 10_000 }
  );
  // Counts for the KPI tiles — we only need totals, so `pageSize: 1` is enough.
  const deliveredToday = useOrders(
    { status: OrderStatus.DELIVERED, pageSize: 1 },
    { enabled: Boolean(auth.user) && isManager }
  );
  // For the sales KPI we need the actual amounts — fetch enough for a daily total.
  const deliveredTodayFull = useOrders(
    { status: OrderStatus.DELIVERED, pageSize: 100 },
    { enabled: Boolean(auth.user) && isManager }
  );
  const completedTodaySales = useMemo(() => {
    const today = new Date().toDateString();
    return (deliveredTodayFull.data?.items ?? [])
      .filter((o) => new Date(o.createdAt).toDateString() === today)
      .reduce((sum, o) => sum + o.totalAmount, 0);
  }, [deliveredTodayFull.data]);

  const incomingItems = useMemo(() => incoming.data?.items ?? [], [incoming.data]);
  const acceptedItems = useMemo(() => accepted.data?.items ?? [], [accepted.data]);
  const preparingItems = useMemo(() => preparing.data?.items ?? [], [preparing.data]);
  const readyItems = useMemo(() => readyForPickup.data?.items ?? [], [readyForPickup.data]);

  /* ---- Bell notifications (derived from the live incoming-orders inbox) -- */

  const bellNotifications: BellNotification[] = useMemo(
    () =>
      incomingItems.map((order) => {
        const when = relativeTime(order.createdAt);
        return {
          id: `incoming:${order.id}`,
          ar: `طلب جديد ${order.orderNumber} — ${order.storeNameAr}`,
          en: 'New incoming order',
          caption: `${when.ar} · ₪${order.totalAmount.toFixed(2)}`,
          tone: 'brand',
        };
      }),
    [incomingItems]
  );

  /* ---- New-order chime + toast ------------------------------------------- */

  // Track the set of PENDING ids we have already announced so the same order
  // does not re-chime on every poll while it sits in the inbox.
  const announcedIds = useRef<Set<string>>(new Set());
  const hasLoadedOnce = useRef(false);
  // Looping alert — plays until the user accepts/taps an order or 10 s elapse.
  const stopAlertRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (incoming.loading || !isManager || !auth.user) return;
    const ids = new Set(incomingItems.map((order) => order.id));
    const fresh = incomingItems.filter((order) => !announcedIds.current.has(order.id));

    // The first successful load seeds the set without announcing history.
    if (!hasLoadedOnce.current) {
      hasLoadedOnce.current = true;
      announcedIds.current = ids;
      return;
    }

    if (fresh.length > 0) {
      for (const order of fresh) announcedIds.current.add(order.id);
      // Looping alert (10 s max) + one toast per poll batch, not per order.
      stopAlertRef.current?.();
      stopAlertRef.current = createLoopingAlert();
      const orderLabel = fresh.length === 1 ? `طلب ${fresh[0].orderNumber}` : `${fresh.length} طلبات جديدة`;
      toast.info(`🔔 ${orderLabel} جديد`, `${fresh.length} new order${fresh.length === 1 ? '' : 's'} arrived`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingItems, incoming.loading, isManager, auth.user]);

  // Stop the looping alert when any order action is taken (accept, reject, etc.).
  const stopAlert = useCallback(() => { stopAlertRef.current?.(); stopAlertRef.current = null; }, []);
  const inbox: OrderSummary[] = useMemo(
    // Kitchen inbox in lifecycle order: PENDING first (needs a decision),
    // then ACCEPTED (start cooking), PREPARING (in progress), READY_FOR_PICKUP
    // (waiting for a captain). All four stages need manager action or visibility.
    () => [...incomingItems, ...acceptedItems, ...preparingItems, ...readyItems],
    [incomingItems, acceptedItems, preparingItems, readyItems]
  );

  const activeCount = incomingItems.length + acceptedItems.length + preparingItems.length + readyItems.length;
  const completedCount = deliveredToday.data?.total ?? 0;

  /* ---- Mutations --------------------------------------------------------- */

  // `pendingOrderId` is kept in a ref so the mutation closure always reads the
  // latest value synchronously. Using useState caused a stale-closure bug:
  // `setPendingOrderId(id)` schedules an async re-render, but `transition.run()`
  // was called immediately after — before the re-render fired — so the closure
  // inside useMutation still saw `null`, and the PATCH went to `/orders/null/status`.
  const pendingOrderIdRef = useRef<string | null>(null);

  const transition = useMutation<UpdateOrderStatusInput, OrderDetail>(
    (input, signal) => updateOrderStatus(pendingOrderIdRef.current as string, input, signal)
  );

  const runTransition = async (
    orderId: string,
    next: OrderStatus,
    ar: string,
    en: string,
    estimatedPrepMinutes?: number
  ): Promise<void> => {
    // Write the ref first — the closure in useMutation reads it synchronously.
    pendingOrderIdRef.current = orderId;
    setPendingOrderId(orderId);   // still needed so OrderRow spinner renders
    const result = await transition.run({ status: next, ...(estimatedPrepMinutes !== undefined ? { estimatedPrepMinutes } : {}) });
    pendingOrderIdRef.current = null;
    setPendingOrderId(null);
    if (result) {
      toast.success(ar, en);
      void incoming.reload();
      void accepted.reload();
      void preparing.reload();
      void readyForPickup.reload();
    } else if (transition.error) {
      toast.error(
        'تعذّر تحديث حالة الطلب',
        transition.error.message,
        { duration: 5_000 }
      );
    }
  };

  const handleAccept = (orderId: string) => {
    stopAlert();
    void runTransition(orderId, OrderStatus.ACCEPTED, 'تم قبول الطلب بنجاح', 'Order accepted successfully', prepMinutes);
  };
  const handleStartPreparing = (orderId: string) =>
    void runTransition(orderId, OrderStatus.PREPARING, 'بدأ التحضير', 'Preparation started');
  const handleReadyForPickup = (orderId: string) =>
    void runTransition(orderId, OrderStatus.READY_FOR_PICKUP, 'الطلب جاهز للاستلام', 'Order ready for pickup');
  const handleReject = (orderId: string) => {
    stopAlert();
    void runTransition(orderId, OrderStatus.CANCELLED, 'تم رفض الطلب', 'Order rejected');
  };

  /* ---- Recent activity (from PENDING order history) -------------------- */

  // The design shows a small "recent activity" strip. With no event stream on
  // the API, the honest source is `statusHistory` of the most recent orders —
  // we render the last four transitions the kitchen actually performed.
  const recentActivity = useMemo(() => {
    const entries: Array<{
      key: string;
      icon: typeof Check;
      tone: string;
      titleAr: string;
      titleEn: string;
      timeAr: string;
      timeEn: string;
    }> = [];

    for (const summary of [...incomingItems, ...acceptedItems, ...preparingItems, ...readyItems]) {
      const when = relativeTime(summary.createdAt);
      entries.push({
        key: `placed:${summary.id}`,
        icon: Package,
        tone: 'bg-brand-surface text-brand-dark',
        titleAr: `طلب جديد ${summary.orderNumber}`,
        titleEn: `New order ${summary.orderNumber}`,
        timeAr: when.ar,
        timeEn: when.en,
      });
    }

    return entries.slice(0, 4);
  }, [incomingItems, acceptedItems, preparingItems, readyItems]);

  /* ---- Gates ------------------------------------------------------------- */

  if (!auth.ready) {
    return (
      <main className="min-h-screen bg-canvas pb-24" aria-busy="true">
        <header className="bg-brand px-4 pb-4 pt-4 text-white">
          <div className="mx-auto flex max-w-md items-center justify-between" aria-hidden="true">
            <span className="h-10 w-10 rounded-xl bg-surface/15" />
            <span className="h-5 w-40 rounded bg-surface/20" />
            <span className="h-10 w-10 rounded-xl bg-surface/15" />
          </div>
        </header>
        <div className="mx-auto max-w-md space-y-4 px-4 pt-5" aria-hidden="true">
          <div className="skeleton h-24 rounded-2xl shadow-card" />
          <div className="skeleton h-40 rounded-2xl shadow-card" />
        </div>
      </main>
    );
  }

  if (!auth.user) {
    return (
      <SignInGate
        auth={auth}
        reasonAr="سجّل الدخول لإدارة طلبات المتجر"
        reasonEn="Sign in to manage your store's orders"
      />
    );
  }

  const apiError = incoming.error ?? accepted.error ?? preparing.error ?? readyForPickup.error ?? deliveredToday.error;
  const loading = managedStores.loading || (incoming.loading && accepted.loading && preparing.loading && readyForPickup.loading);

  /* ---- Render ------------------------------------------------------------ */

  return (
    <main className={`min-h-screen bg-canvas pb-24 font-sans text-ink transition-[padding] duration-300 ${sidebarOpen ? 'md:pr-60' : ''}`}>
      {sidebarOpen && <button type="button" aria-label={t('إغلاق القائمة', 'Close navigation')} onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-20 bg-ink/40 md:hidden" />}
      <aside className={`fixed inset-y-0 right-0 z-30 flex w-60 flex-col bg-brand-deep px-4 py-6 text-white shadow-overlay transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`} aria-label={t('تنقل مدير المتجر', 'Store manager navigation')}>
        <p className="px-3 text-lg font-extrabold">Samou' Go</p>
        <p className="px-3 text-[11px] text-white/70">مدير المتجر</p>
        <nav className="mt-8 flex-1 space-y-1">
          {BOTTOM_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-bold transition-all duration-200 ${selected ? 'bg-brand text-white shadow-brand' : 'text-white/75 hover:bg-white/10 hover:text-white active:scale-[0.97]'}`}>
              <Icon size={18} /><span>{t(tab.ar, tab.en)}</span>
            </button>;
          })}
        </nav>
        <div className="border-t border-white/10 pt-5">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-sm font-extrabold text-brand-deep">
              {auth.user?.name.slice(0, 2).toUpperCase() ?? 'م'}
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-[12px]">{auth.user?.name ?? 'مدير المتجر'}</strong>
              <span className="block truncate text-[11px] text-white/70">مدير المتجر</span>
            </span>
            <button
              type="button"
              onClick={auth.signOut}
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
              className="ms-auto rounded-lg p-2 text-white/70 transition hover:bg-surface/10 hover:text-white"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
        <button type="button" onClick={() => setSidebarOpen(false)} aria-label={t('إغلاق القائمة', 'Close navigation')} className="absolute start-3 top-3 rounded-lg p-2 text-white/80 hover:bg-white/10 md:hidden"><X size={18} /></button>
      </aside>
      <header className="bg-brand px-4 pb-4 pt-4 text-white">
        <nav className="mx-auto flex max-w-md items-center justify-between" aria-label="التنقل الرئيسي">
          <button type="button" onClick={() => setSidebarOpen(value => !value)} aria-expanded={sidebarOpen} aria-label={t('فتح القائمة', 'Open navigation')} className="rounded-lg p-2 text-white transition hover:bg-white/10 active:scale-95"><Menu size={21} /></button>
          <div className="flex-1 text-center leading-tight">
            <h1 className="text-[15px] font-extrabold">{t('لوحة المتجر', 'Store Manager')}</h1>
          </div>
          <div className="flex items-center gap-2" dir="ltr">
            <LanguageToggle onDark />
            <ThemeToggle onDark />
            <NotificationBell
              notifications={bellNotifications}
              storageKey="store-manager"
              chimeOnNew
              onDark
              max={10}
            />
            <button
              type="button"
              onClick={auth.signOut}
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
              className="rounded-lg p-2 text-white/80 transition hover:bg-surface/10 hover:text-white"
            >
              <LogOut size={17} />
            </button>
          </div>
        </nav>
        <div className="mx-auto mt-3 flex max-w-md items-center justify-between rounded-xl bg-brand-dark px-3 py-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isOpen ? 'bg-brand-tint' : 'bg-white/40'}`} />
            <span className="text-xs font-bold">
              {t(isOpen ? 'متجر مفتوح' : 'متجر مغلق', isOpen ? 'Open' : 'Closed')}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isOpen}
            aria-label="تبديل حالة المتجر"
            disabled={storeTogglePending || !managedStoreId}
            onClick={() => void handleToggleStore()}
            className={`flex h-6 w-11 items-center rounded-full p-1 transition ${
              isOpen ? 'bg-surface/90 justify-end' : 'bg-black/25 justify-start'
            }`}
          >
            <span className={`h-4 w-4 rounded-full ${isOpen ? 'bg-brand' : 'bg-surface'}`} />
          </button>
        </div>

        {/* Operating hours */}
        <div className="mx-auto mt-2 max-w-md rounded-xl bg-brand-dark/80 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-bold text-white/90">
            <Clock3 size={13} />
            <span>{t('أوقات العمل', 'Operating hours')}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="flex-1">
              <span className="block text-[10px] text-white/70">{t('من', 'From')}</span>
              <input
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white outline-none focus:border-white/40"
              />
            </label>
            <span className="mt-4 text-white/50">—</span>
            <label className="flex-1">
              <span className="block text-[10px] text-white/70">{t('إلى', 'To')}</span>
              <input
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white outline-none focus:border-white/40"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSaveHours()}
              disabled={hoursPending}
              className="mt-4 rounded-lg bg-white/20 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/30 active:scale-95 disabled:opacity-60"
            >
              {hoursPending ? <Loader2 size={12} className="animate-spin" /> : t('حفظ', 'Save')}
            </button>
          </div>
        </div>
      </header>

      {managedStore.data && (
        <StoreLocationPrompt
          store={managedStore.data}
          storeId={managedStoreId}
          onSaved={() => void managedStore.reload()}
        />
      )}

      {managedStore.data?.dedicatedCaptains && (
        <section className="mx-auto max-w-md px-4 pt-5" aria-label="Dedicated captains">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold">{t('كباتن المتجر', 'Dedicated captains')}</h2>
              </div>
              <span className="badge-neutral">{managedStore.data.dedicatedCaptains.length}</span>
            </div>
            {managedStore.data.dedicatedCaptains.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {managedStore.data.dedicatedCaptains.map((captain) => (
                  <li key={captain.id} className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2">
                    <div>
                      <p className="text-xs font-bold text-ink">{captain.name}</p>
                      <p className="text-micro text-ink-muted" dir="ltr">{captain.phone}</p>
                    </div>
                    <span className={captain.isAvailable && captain.isVerified ? 'badge-brand' : 'badge-neutral'}>
                      {t(captain.isAvailable && captain.isVerified ? 'متاح' : 'غير متاح', captain.isAvailable && captain.isVerified ? 'Available' : 'Offline')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-ink-muted">{t('لا يوجد كابتن مخصص لهذا المتجر', 'No dedicated captain assigned.')}</p>
            )}
          </div>
        </section>
      )}

      {/* ---- HOME TAB ---------------------------------------------------- */}
      {activeTab === 'home' && <>

      {/* KPIs */}
      <section className="mx-auto max-w-md px-4 pt-5" aria-label="ملخص الأداء">
        <div className="flex gap-3 overflow-x-auto pb-1">
          <KpiTile
            icon={<span className="text-lg">₪</span>}
            labelAr="الطلبات النشطة"
            labelEn="Active Orders"
            value={String(activeCount)}
            suffix=""
            isLoading={loading}
          />
          <KpiTile
            icon={<Package size={17} />}
            labelAr="قيد التحضير"
            labelEn="Preparing"
            value={String(preparingItems.length)}
            suffix=""
            isLoading={preparing.loading}
          />
          <KpiTile
            icon={<Check size={18} strokeWidth={3} />}
            labelAr="مكتملة"
            labelEn="Completed"
            value={String(completedCount)}
            suffix=""
            isLoading={deliveredToday.loading}
          />
          <KpiTile
            icon={<BarChart3 size={17} />}
            labelAr="مبيعات اليوم"
            labelEn="Today's Sales"
            value={String(completedTodaySales.toFixed(0))}
            suffix="₪"
            isLoading={deliveredToday.loading}
          />
        </div>
      </section>

      {apiError && !loading && (
        <section className="mx-auto max-w-md px-4 pt-5" aria-live="assertive">
          <div className="rounded-2xl border border-danger-tint bg-surface p-5 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
              <AlertTriangle size={22} />
            </span>
            <h2 className="mt-3 text-sm font-extrabold">{t('تعذّر تحميل الطلبات', 'Could not load orders')}</h2>
            <p className="mt-2 text-xs text-ink-soft">{language === 'ar' ? apiError.message : apiError.localizedMessage}</p>
            <button
              type="button"
              onClick={() => {
                void incoming.refresh();
                void accepted.refresh();
                void preparing.refresh();
                void readyForPickup.refresh();
                void deliveredToday.refresh();
              }}
              disabled={incoming.refreshing || accepted.refreshing || preparing.refreshing || readyForPickup.refreshing}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {incoming.refreshing || accepted.refreshing || preparing.refreshing || readyForPickup.refreshing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {t('إعادة المحاولة', 'Retry')}
            </button>
          </div>
        </section>
      )}

      {/* Incoming orders */}
      <section className="mx-auto max-w-md px-4 pt-7" aria-labelledby="incoming-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 id="incoming-title" className="text-lg font-extrabold">
              {t('الطلبات الواردة', 'Incoming Orders')}
            </h2>
          </div>
          <span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-extrabold text-brand-dark">
            {activeCount}
          </span>
        </div>

        {transition.error && (
          <p
            className="mb-3 flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-xs font-semibold text-danger-ink"
            aria-live="assertive"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{language === 'ar' ? transition.error.message : transition.error.localizedMessage}</span>
          </p>
        )}

        <label className="mb-3 flex items-center justify-between rounded-xl bg-brand-surface px-3 py-2 text-xs font-bold text-brand-deep">
          <span>{t('وقت التحضير عند القبول', 'Prep time')}</span>
          <select value={prepMinutes} onChange={(event) => setPrepMinutes(Number(event.target.value))} className="rounded-lg border border-brand bg-surface px-2 py-1 text-xs text-ink outline-none">
            {[15, 20, 25, 30, 40, 50, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
          </select>
        </label>
        <div className="space-y-3">
          {loading && inbox.length === 0
            ? [0, 1].map((index) => (
                <div
                  key={index}
                  className="skeleton h-28 rounded-2xl shadow-card"
                  aria-hidden="true"
                />
              ))
            : inbox.length === 0 && !apiError
              ? <EmptyInbox />
              : inbox.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    pending={pendingOrderId === order.id && transition.pending}
                    onAccept={() => handleAccept(order.id)}
                    onStartPreparing={() => handleStartPreparing(order.id)}
                    onReadyForPickup={() => handleReadyForPickup(order.id)}
                    onReject={() => handleReject(order.id)}
                  />
                ))}
        </div>
      </section>

      {/* Quick actions — presentational, no API call behind them yet */}
      <section className="mx-auto max-w-md px-4 pt-7" aria-labelledby="quick-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 id="quick-title" className="text-lg font-extrabold">
              {t('إجراءات سريعة', 'Quick Actions')}
            </h2>
          </div>
          <SlidersHorizontal size={17} className="text-ink-muted" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.en}
              type="button"
              onClick={() => setActiveTab(action.tab)}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-end shadow-card transition hover:border-brand-tint hover:bg-brand-surface focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                <action.icon size={18} />
              </span>
              <span>
                <strong className="block text-xs font-extrabold">{t(action.ar, action.en)}</strong>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-md px-4 pb-5 pt-7" aria-labelledby="activity-title">
        <div className="mb-4">
          <h2 id="activity-title" className="text-lg font-extrabold">
            {t('النشاط الأخير', 'Recent Activity')}
          </h2>
        </div>
        {recentActivity.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-center text-xs text-ink-muted">
            {t('لا يوجد نشاط حديث', 'No recent activity')}
          </p>
        ) : (
          <ol className="space-y-4">
            {recentActivity.map((entry) => (
              <li key={entry.key} className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${entry.tone}`}
                >
                  <entry.icon size={16} />
                </span>
                <span className="min-w-0">
                  <strong className="block text-xs font-bold">{t(entry.titleAr, entry.titleEn)}</strong>
                  <span className="mt-0.5 block text-micro text-ink-muted">
                    {t(entry.timeAr, entry.timeEn)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      </> /* end HOME TAB */}

      {/* Orders tab — focused inbox across all kitchen stages */}
      {activeTab === 'orders' && (
        <section className="mx-auto max-w-[720px] px-4 pt-7 pb-8" aria-labelledby="orders-tab-title">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 id="orders-tab-title" className="text-lg font-extrabold">{t('الطلبات', 'All active orders')}</h2>
            </div>
            <span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-extrabold text-brand-dark">
              {activeCount}
            </span>
          </div>

          {transition.error && (
            <p
              className="mb-3 flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-xs font-semibold text-danger-ink"
              aria-live="assertive"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{language === 'ar' ? transition.error.message : transition.error.localizedMessage}</span>
            </p>
          )}

          {loading && inbox.length === 0 ? (
            [0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-28 rounded-2xl shadow-card" aria-hidden="true" />
            ))
          ) : inbox.length === 0 ? (
            <EmptyInbox />
          ) : (
            <div className="space-y-3">
              {inbox.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  pending={pendingOrderId === order.id && transition.pending}
                  onAccept={() => handleAccept(order.id)}
                  onStartPreparing={() => handleStartPreparing(order.id)}
                  onReadyForPickup={() => handleReadyForPickup(order.id)}
                  onReject={() => handleReject(order.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Products tab */}
      {activeTab === 'products' && (
        <section className="mx-auto max-w-[720px] px-4 pt-7 pb-8" aria-labelledby="products-tab-title">
          <div className="mb-5">
            <h2 id="products-tab-title" className="text-lg font-extrabold">{t('إدارة القائمة', 'Menu Management')}</h2>
            {/* Products ↔ Sections sub-toggle */}
            <div className="mt-3 inline-flex items-center gap-1 rounded-xl border border-line bg-canvas p-1">
              <button
                type="button"
                onClick={() => setMenuView('products')}
                aria-pressed={menuView === 'products'}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${
                  menuView === 'products' ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink-soft'
                }`}
              >
                <ShoppingBag size={13} />
                {t('المنتجات', 'Products')}
              </button>
              <button
                type="button"
                onClick={() => setMenuView('sections')}
                aria-pressed={menuView === 'sections'}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${
                  menuView === 'sections' ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink-soft'
                }`}
              >
                <SlidersHorizontal size={13} />
                {t('الأقسام', 'Sections')}
              </button>
            </div>
          </div>
          {managedStores.loading && !managedStores.data ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card" aria-busy="true">
              <Loader2 size={22} className="mx-auto animate-spin text-brand" />
              <p className="mt-3 text-sm text-ink-muted">{t('جاري تحميل بيانات المتجر…', 'Loading store…')}</p>
            </div>
          ) : managedStores.error && !managedStores.data ? (
            <div className="rounded-2xl border border-danger-tint bg-surface p-6 text-center shadow-card" role="alert">
              <AlertTriangle size={22} className="mx-auto text-danger-ink" />
              <h3 className="mt-3 text-sm font-extrabold">تعذّر تحميل المتجر</h3>
              <p className="mt-1 text-xs text-ink-muted">{language === 'ar' ? managedStores.error.message : managedStores.error.localizedMessage}</p>
              <button
                type="button"
                onClick={() => managedStores.refresh()}
                disabled={managedStores.refreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-60"
              >
                <RefreshCw size={14} className={managedStores.refreshing ? 'animate-spin' : ''} />
                {t('إعادة المحاولة', 'Retry')}
              </button>
            </div>
          ) : managedStoreId ? (
            menuView === 'sections' ? (
              <CategoriesPanel storeId={managedStoreId} />
            ) : (
              <ProductCataloguePanel storeId={managedStoreId} />
            )
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
              <p className="text-sm text-ink-muted">
                {t('لا يوجد متجر مرتبط بحسابك — تواصل مع المشرف', 'No store linked to your account')}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Offers tab */}
      {activeTab === 'offers' && (
        <section className="mx-auto max-w-[720px] px-4 pt-7 pb-8" aria-labelledby="offers-tab-title">
          <div className="mb-5">
            <h2 id="offers-tab-title" className="text-lg font-extrabold">{t('العروض الترويجية', 'Promotional Offers')}</h2>
          </div>
          {managedStores.loading && !managedStores.data ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card" aria-busy="true">
              <Loader2 size={22} className="mx-auto animate-spin text-brand" />
              <p className="mt-3 text-sm text-ink-muted">{t('جاري تحميل بيانات المتجر…', 'Loading store…')}</p>
            </div>
          ) : managedStores.error && !managedStores.data ? (
            <div className="rounded-2xl border border-danger-tint bg-surface p-6 text-center shadow-card" role="alert">
              <AlertTriangle size={22} className="mx-auto text-danger-ink" />
              <h3 className="mt-3 text-sm font-extrabold">{t('تعذّر تحميل المتجر', 'Failed to load store')}</h3>
              <p className="mt-1 text-xs text-ink-muted">{language === 'ar' ? managedStores.error.message : managedStores.error.localizedMessage}</p>
              <button
                type="button"
                onClick={() => managedStores.refresh()}
                disabled={managedStores.refreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-60"
              >
                <RefreshCw size={14} className={managedStores.refreshing ? 'animate-spin' : ''} />
                {t('إعادة المحاولة', 'Retry')}
              </button>
            </div>
          ) : managedStoreId ? (
            <OffersPanel storeId={managedStoreId} />
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
              <p className="text-sm text-ink-muted">
                {t('لا يوجد متجر مرتبط بحسابك — تواصل مع المشرف', 'No store linked to your account')}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Store profile tab */}
      {activeTab === 'settings' && (
        <section className="mx-auto max-w-[720px] px-4 pt-7 pb-8" aria-labelledby="profile-tab-title">
          <div className="mb-5">
            <h2 id="profile-tab-title" className="text-lg font-extrabold">{t('إعدادات المتجر', 'Store Profile & Settings')}</h2>
          </div>
          {managedStores.loading && !managedStores.data ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card" aria-busy="true">
              <Loader2 size={22} className="mx-auto animate-spin text-brand" />
              <p className="mt-3 text-sm text-ink-muted">{t('جاري تحميل بيانات المتجر…', 'Loading store…')}</p>
            </div>
          ) : managedStores.error && !managedStores.data ? (
            <div className="rounded-2xl border border-danger-tint bg-surface p-6 text-center shadow-card" role="alert">
              <AlertTriangle size={22} className="mx-auto text-danger-ink" />
              <h3 className="mt-3 text-sm font-extrabold">تعذّر تحميل المتجر</h3>
              <p className="mt-1 text-xs text-ink-muted">{language === 'ar' ? managedStores.error.message : managedStores.error.localizedMessage}</p>
              <button
                type="button"
                onClick={() => managedStores.refresh()}
                disabled={managedStores.refreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-60"
              >
                <RefreshCw size={14} className={managedStores.refreshing ? 'animate-spin' : ''} />
                {t('إعادة المحاولة', 'Retry')}
              </button>
            </div>
          ) : managedStoreId ? (
            <StoreProfilePanel storeId={managedStoreId} />
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
              <p className="text-sm text-ink-muted">
                {t('لا يوجد متجر مرتبط بحسابك — تواصل مع المشرف', 'No store linked to your account')}
              </p>
            </div>
          )}
        </section>
      )}
      {activeTab === 'custom-requests' && managedStoreId && <CustomRequestsPanel storeId={managedStoreId} />}

      <nav
        className="fixed bottom-0 inset-x-0 z-20 border-t border-line bg-surface px-3 safe-bottom pt-2 shadow-raised md:hidden"
        aria-label="التنقل السفلي"
      >
        <div className="mx-auto flex max-w-md items-center justify-around">
          {BOTTOM_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-w-[62px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-brand/30 ${
                activeTab === tab.id ? 'text-brand' : 'text-ink-muted hover:text-ink-soft'
              }`}
            >
              <tab.icon size={19} fill={activeTab === tab.id && tab.id === 'home' ? 'currentColor' : 'none'} />
              <span className="text-micro font-bold">{t(tab.ar, tab.en)}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components
 * ------------------------------------------------------------------------- */

interface KpiTileProps {
  icon: React.ReactNode;
  labelAr: string;
  labelEn: string;
  value: string;
  suffix: string;
  isLoading: boolean;
}

function KpiTile({ icon, labelAr, labelEn, value, suffix, isLoading }: KpiTileProps) {
  const { t } = useLanguage();
  return (
    <article className="min-w-[126px] flex-1 rounded-2xl border border-line bg-surface p-3 shadow-card">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-brand-tint text-brand">
        {icon}
      </div>
      <p className="mt-0.5 whitespace-nowrap text-[12px] font-bold text-ink-soft">{t(labelAr, labelEn)}</p>
      <p dir="ltr" className="mt-1 text-xl font-extrabold tracking-tight text-ink">
        {isLoading ? (
          <span className="inline-block h-6 w-12 animate-pulse rounded bg-line-soft" aria-hidden="true" />
        ) : (
          <>
            {value} <span className="text-sm text-ink-soft">{suffix}</span>
          </>
        )}
      </p>
    </article>
  );
}

interface OrderRowProps {
  order: OrderSummary;
  customerPhone?: string;
  customerName?: string;
  pending: boolean;
  onAccept: () => void;
  onStartPreparing: () => void;
  onReadyForPickup: () => void;
  onReject: () => void;
}

function OrderRow({ order, customerPhone, customerName, pending, onAccept, onStartPreparing, onReadyForPickup, onReject }: OrderRowProps) {
  const { t } = useLanguage();
  const time = relativeTime(order.createdAt);
  const itemCount = order.itemCount;
  const itemLineAr = `${itemCount} منتج`;
  const itemLineEn = `${itemCount} items`;

  // Determine which primary action button to show based on current status.
  // The manager drives: PENDING→ACCEPTED, ACCEPTED→PREPARING, PREPARING→READY_FOR_PICKUP.
  // READY_FOR_PICKUP orders are shown for visibility (captain will claim them).
  const primaryAction: {
    labelAr: string;
    labelEn: string;
    icon: typeof Check;
    handler: () => void;
    color: string;
  } | null = (() => {
    switch (order.status) {
      case OrderStatus.PENDING:
        return { labelAr: 'قبول', labelEn: 'Accept', icon: Check, handler: onAccept, color: 'bg-brand hover:bg-brand-dark focus:ring-brand/40 text-white' };
      case OrderStatus.ACCEPTED:
        return { labelAr: 'بدء التحضير', labelEn: 'Start Cooking', icon: UtensilsCrossed, handler: onStartPreparing, color: 'bg-warning hover:bg-warning-dark focus:ring-warning/40 text-white' };
      case OrderStatus.PREPARING:
        return { labelAr: 'جاهز للاستلام', labelEn: 'Mark Ready', icon: PackageCheck, handler: onReadyForPickup, color: 'bg-info hover:bg-info-dark focus:ring-info/40 text-white' };
      default:
        return null;
    }
  })();

  // The store manager may cancel from any status except ON_THE_WAY (the order
  // is with the captain) — same contract the server enforces via
  // `canRoleTransitionOrderStatus`.
  const canCancel = canRoleTransitionOrderStatus(
    UserRole.STORE_MANAGER,
    order.status,
    OrderStatus.CANCELLED
  );

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between border-b border-line-soft pb-3">
        <div>
          <p dir="ltr" className="text-sm font-extrabold text-ink">
            طلب {order.orderNumber}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-micro text-ink-muted">
            <Clock3 size={12} />
            <span>{t(time.ar, time.en)}</span>
          </p>
        </div>
        <Badge tone={ORDER_STATUS_TONES[order.status]} dot>
          {t(ORDER_STATUS_LABELS[order.status].ar, ORDER_STATUS_LABELS[order.status].en)}
        </Badge>
      </div>
      <div className="py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">{order.storeNameAr}</p>
            <p className="mt-1 text-[11px] text-ink-muted">
              {t(itemLineAr, itemLineEn)}
            </p>
          </div>
          <p dir="ltr" className="text-base font-extrabold text-ink">
            ₪{order.totalAmount.toFixed(2)}
          </p>
        </div>
        {order.estimatedPrepMinutes !== null && order.estimatedPrepMinutes !== undefined && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-brand-dark">
            <Clock3 size={13} />
            {t(`مدة التحضير المقدّرة: ${order.estimatedPrepMinutes} دقيقة`, `Estimated prep: ${order.estimatedPrepMinutes} min`)}
          </p>
        )}
        {(order.orderNote || order.itemNotes.length > 0) && (
          <div className="mt-3 space-y-1.5 rounded-xl bg-brand-surface px-3 py-2">
            {order.orderNote && (
              <p className="flex items-start gap-1.5 text-[11px] font-semibold text-ink">
                <StickyNote size={12} className="mt-0.5 shrink-0 text-brand" />
                <span>{order.orderNote}</span>
              </p>
            )}
            {order.itemNotes.map((entry) => (
              <p
                key={`${entry.productNameAr}:${entry.quantity}`}
                className="flex items-start gap-1.5 text-[11px] text-ink-soft"
              >
                <StickyNote size={12} className="mt-0.5 shrink-0 text-brand" />
                <span>
                  <b className="font-bold text-ink">{entry.productNameAr}</b>
                  <span className="mx-0.5 text-ink-muted" dir="ltr">
                    ×{entry.quantity}
                  </span>
                  : {entry.note}
                </span>
              </p>
            ))}
          </div>
        )}
        {/* Delivery preset badge */}
        {'deliveryPreset' in order && (order as { deliveryPreset?: string }).deliveryPreset && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-info-ink">
            <Phone size={12} />
            {t(
              (order as { deliveryPreset?: string }).deliveryPreset === 'call_on_arrival' ? 'اتصل عند الوصول' : 'اترك عند الباب',
              (order as { deliveryPreset?: string }).deliveryPreset === 'call_on_arrival' ? 'Call on arrival' : 'Leave at door'
            )}
          </p>
        )}
      </div>

      {/* READY_FOR_PICKUP: informational — captain is expected to claim it */}
      {order.status === OrderStatus.READY_FOR_PICKUP && (
        <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-info-tint px-3 py-2 text-[11px] font-semibold text-info-ink">
          <ChevronRight size={14} className="shrink-0 rtl:rotate-180" />
          <span>{t('جاهز — بانتظار كابتن التوصيل', 'Waiting for a captain')}</span>
        </p>
      )}

      {(primaryAction || canCancel || customerPhone) && (
        <div className={`grid gap-2 ${(primaryAction && canCancel) || (primaryAction && customerPhone) || (canCancel && customerPhone) ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.handler}
              disabled={pending}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition focus:outline-none focus:ring-2 disabled:opacity-60 ${primaryAction.color}`}
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <primaryAction.icon size={15} />}
              {t(primaryAction.labelAr, primaryAction.labelEn)}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={onReject}
              disabled={pending}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-danger-tint py-2.5 text-xs font-bold text-danger transition hover:bg-danger-tint focus:outline-none focus:ring-2 focus:ring-danger/40 disabled:opacity-60"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
              {t('رفض', 'Cancel')}
            </button>
          )}
          {customerPhone && (
            <a
              href={formatWhatsAppLink(
                customerPhone,
                WHATSAPP_MESSAGES.storeManager(order.orderNumber, customerName, order.storeNameAr)
              )}
              target="_blank"
              rel="noreferrer"
              aria-label={t('تواصل عبر واتساب', 'Contact via WhatsApp')}
              title={t('تواصل عبر واتساب', 'Contact via WhatsApp')}
              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white transition hover:opacity-90 active:scale-95"
              style={{ backgroundColor: '#25D366' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.67m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378 3.094 3.094 0 01-.988-.77 9.86 9.86 0 004.776-5.684 3.072 3.072 0 011.228-.378c1.613 0 2.612 1.228 2.612 2.944 0 1.85-1.54 3.325-3.328 3.724-.34.074-.68.148-1.02.222-.34.074-.567.075-.827-.074-.26-.148-.774-.865-1.077-1.488-.302-.622-.373-1.1-.074-1.328s.722-.148 1.095-.074c.373.075.68.3 1.02.623.623.56 1.096 1.592 1.314 2.56.183.78.173 1.558.048 2.068-.099.404-.404.828-.758 1.096-.353.267-.827.374-1.327.312-.488-.062-.948-.136-1.267-.375l-.57-.373c-.43-.238-.675-.286-1.12-.173-.352.123-1.121.375-1.582.81-.507.475-1.53 1.146-1.53 2.104 0 1.137.985 2.14 2.17 2.357.267.049.52.049.804.049.373 0 .747-.099 1.095-.272.34-.173.64-.397.89-.748.267-.373.39-.85.323-1.096-.074-.26-.468-.436-.967-.623-.373-.148-.847-.148-1.24-.074-.622.075-1.106.507-1.342 1.137-.21.576-.21 1.127-.105 1.274.105.15.423.624 1.096 1.517.788.975 2.03 2.18 2.03 3.558 0 2.374-2.778 2.374-2.778 2.914" />
              </svg>
              <span>{t('واتساب', 'WhatsApp')}</span>
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function EmptyInbox() {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
        <Store size={22} />
      </span>
      <h3 className="mt-3 text-sm font-extrabold">{t('لا توجد طلبات واردة', 'No incoming orders')}</h3>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * StoreLocationPrompt — first-login banner asking the manager to set the
 * store's GPS coordinates (navigator.geolocation → PATCH /stores/:storeId).
 * Shows only while the store has no lat/lng; the captain navigates using
 * these coordinates, so an address-less store is half the road story.
 * ------------------------------------------------------------------------- */

function storeLocationDismissKey(storeId: string): string {
  return `samou.store-location.dismissed.${storeId}`;
}

function readDismissed(storeId: string): boolean {
  try {
    return window.localStorage.getItem(storeLocationDismissKey(storeId)) === '1';
  } catch {
    return false;
  }
}

function markDismissed(storeId: string): void {
  try {
    window.localStorage.setItem(storeLocationDismissKey(storeId), '1');
  } catch {
    /* Private mode — the banner may reappear next load, acceptable. */
  }
}

function StoreLocationPrompt({
  store,
  storeId,
  onSaved,
}: {
  store: StoreType;
  storeId: string | null;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => readDismissed(storeId ?? ''));

  const hasLocation =
    store.latitude !== null && store.latitude !== undefined &&
    store.longitude !== null && store.longitude !== undefined;

  if (!storeId || hasLocation || dismissed) return null;

  const capture = () => {
    if (busy || !('geolocation' in navigator)) {
      toast.error(
        t('تحديد الموقع غير مدعوم في هذا المتصفح', 'Geolocation is unavailable'),
        t('تحديد الموقع غير مدعوم في هذا المتصفح', 'Geolocation is unavailable'),
      );
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          await updateStore(storeId, {
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          markDismissed(storeId);
          setDismissed(true);
          toast.success('تم حفظ موقع المتجر', 'Store location saved');
          onSaved();
        } catch {
          toast.error('تعذّر حفظ الموقع — حاول مجدداً', 'Could not save location — try again');
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        toast.error(
          'تعذّر تحديد الموقع — تحقق من إذن الموقع',
          'Location permission was not granted',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const skip = () => {
    if (!storeId) return;
    markDismissed(storeId);
    setDismissed(true);
  };

  return (
    <section className="mx-auto max-w-md px-4 pt-5" aria-label="Store location prompt">
      <div className="rounded-2xl border border-warning-tint bg-surface p-4 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
            <MapPin size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-extrabold text-ink">
              {t('حدّد موقع المتجر على الخريطة', 'Set your store location')}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
              {t(
                'لن يتمكن الكابتن من الوصول إلى متجرك حتى تحدد موقعه على الخريطة. شارك موقعك الحالي الآن.',
                'Captains cannot navigate to your store until its location is set. Share your current location now.',
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void capture()}
                disabled={busy}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                {t('استخدام موقعي الحالي', 'Use my current location')}
              </button>
              <button
                type="button"
                onClick={skip}
                disabled={busy}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-bold text-ink-muted transition hover:bg-canvas active:scale-95 disabled:opacity-60"
              >
                <X size={13} />
                {t('لاحقاً', 'Later')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
