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

import { useEffect, useMemo, useRef, useState } from 'react';
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
  LogOut,
  Package,
  PackageCheck,
  RefreshCw,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  StickyNote,
  Store,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import {
  SignInGate,
  updateOrderStatus,
  updateStore,
  useAuth,
  useMutation,
  useMyStores,
  useOrders,
  useStoreManager,
  useToast,
} from '@samou-go/api-client';
import { playNewOrderChime } from '@samou-go/ui';
import {
  LanguageToggle,
  NotificationBell,
  ThemeToggle,
  Badge,
  type BellNotification,
} from '@samou-go/ui';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  OrderStatus,
  UserRole,
  canTransitionOrderStatus,
  type OrderDetail,
  type OrderSummary,
  type UpdateOrderStatusInput,
} from '@samou-go/shared-types';
import { ProductCataloguePanel } from './ProductCataloguePanel';
import { StoreProfilePanel } from './StoreProfilePanel';

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
  { icon: Settings, ar: 'إعدادات المتجر', en: 'Store Settings', tab: 'settings' },
  { icon: Package, ar: 'الطلبات النشطة', en: 'Active Orders', tab: 'orders' },
  { icon: BarChart3, ar: 'لوحة التحكم', en: 'Dashboard', tab: 'home' },
] as const;

const BOTTOM_TABS = [
  { id: 'home', icon: Home, ar: 'الرئيسية', en: 'Home' },
  { id: 'orders', icon: Package, ar: 'الطلبات', en: 'Orders' },
  { id: 'products', icon: ShoppingBag, ar: 'المنتجات', en: 'Products' },
  { id: 'settings', icon: Settings, ar: 'إعدادات المتجر', en: 'Settings' },
] as const;

/* ---------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------- */

export function SamouGoStoreManager() {
  const auth = useAuth();
  const toast = useToast();

  /* -- Role gate --------------------------------------------------------- */
  const isManager = auth.user?.role === UserRole.STORE_MANAGER;

  /* ---- Resolve the manager's store id ----------------------------------- */
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
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  /* -- /Role gate --------------------------------------------------------- */

  const handleToggleStore = async () => {
    if (!managedStoreId || storeTogglePending) return;
    const next = !isOpen;
    setIsOpen(next);
    setStoreTogglePending(true);
    try {
      await updateStore(managedStoreId, { isActive: next });
      toast.success(next ? 'تم فتح المتجر ✅' : 'تم إغلاق المتجر', next ? 'Store is now open' : 'Store is now closed');
    } catch (err) {
      setIsOpen(!next);
      toast.error('تعذّر تحديث حالة المتجر', err instanceof Error ? err.message : String(err));
    } finally {
      setStoreTogglePending(false);
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
      // One chime + one toast per poll batch, not per order.
      playNewOrderChime();
      const orderLabel = fresh.length === 1 ? `طلب ${fresh[0].orderNumber}` : `${fresh.length} طلبات جديدة`;
      toast.info(`🔔 ${orderLabel} جديد`, `${fresh.length} new order${fresh.length === 1 ? '' : 's'} arrived`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingItems, incoming.loading, isManager, auth.user]);
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

  const handleAccept = (orderId: string) =>
    void runTransition(orderId, OrderStatus.ACCEPTED, 'تم قبول الطلب بنجاح', 'Order accepted successfully', prepMinutes);
  const handleStartPreparing = (orderId: string) =>
    void runTransition(orderId, OrderStatus.PREPARING, 'بدأ التحضير', 'Preparation started');
  const handleReadyForPickup = (orderId: string) =>
    void runTransition(orderId, OrderStatus.READY_FOR_PICKUP, 'الطلب جاهز للاستلام', 'Order ready for pickup');
  const handleReject = (orderId: string) =>
    void runTransition(orderId, OrderStatus.CANCELLED, 'تم رفض الطلب', 'Order rejected');

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
      detail: string;
    }> = [];

    for (const summary of [...incomingItems, ...acceptedItems, ...preparingItems, ...readyItems]) {
      const when = relativeTime(summary.createdAt);
      entries.push({
        key: `placed:${summary.id}`,
        icon: Package,
        tone: 'bg-brand-surface text-brand-dark',
        titleAr: `طلب جديد ${summary.orderNumber}`,
        titleEn: `New order ${summary.orderNumber}`,
        detail: `${when.ar} · ${when.en}`,
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
  const loading = incoming.loading && accepted.loading && preparing.loading && readyForPickup.loading;

  /* ---- Render ------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-canvas pb-24 font-sans text-ink md:pe-60">
      <aside className="fixed inset-y-0 end-0 z-30 hidden w-60 flex-col bg-brand-deep px-4 py-6 text-white md:flex" aria-label="تنقل مدير المتجر">
        <p className="px-3 text-lg font-extrabold">Samou' Go</p>
        <p className="px-3 text-[11px] text-white/70">مدير المتجر</p>
        <nav className="mt-8 flex-1 space-y-1">
          {BOTTOM_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-bold transition ${selected ? 'bg-brand text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
              <Icon size={18} /><span>{tab.ar}</span>
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
      </aside>
      <header className="bg-brand px-4 pb-4 pt-4 text-white">
        <nav className="mx-auto flex max-w-md items-center justify-between" aria-label="التنقل الرئيسي">
          <div className="flex-1 text-center leading-tight">
            <h1 className="text-[15px] font-extrabold">لوحة المتجر</h1>
            <p dir="ltr" className="text-micro font-medium text-white/80">
              Store Manager
            </p>
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
              {isOpen ? 'متجر مفتوح' : 'متجر مغلق'}
              <span dir="ltr" className="ms-2 text-micro text-white/80">
                {isOpen ? 'Open' : 'Closed'}
              </span>
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
      </header>

      {managedStore.data?.dedicatedCaptains && (
        <section className="mx-auto max-w-md px-4 pt-5" aria-label="Dedicated captains">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold">كباتن المتجر</h2>
                <p className="text-[11px] text-ink-muted" dir="ltr">Dedicated captains</p>
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
                      {captain.isAvailable && captain.isVerified ? 'متاح / Available' : 'غير متاح / Offline'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-ink-muted">لا يوجد كابتن مخصص لهذا المتجر / No dedicated captain assigned.</p>
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
        </div>
      </section>

      {apiError && !loading && (
        <section className="mx-auto max-w-md px-4 pt-5" aria-live="assertive">
          <div className="rounded-2xl border border-danger-tint bg-surface p-5 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
              <AlertTriangle size={22} />
            </span>
            <h2 className="mt-3 text-sm font-extrabold">تعذّر تحميل الطلبات</h2>
            <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
              Could not load orders
            </p>
            <p className="mt-2 text-xs text-ink-soft">{apiError.message}</p>
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
              إعادة المحاولة <span dir="ltr">Retry</span>
            </button>
          </div>
        </section>
      )}

      {/* Incoming orders */}
      <section className="mx-auto max-w-md px-4 pt-7" aria-labelledby="incoming-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 id="incoming-title" className="text-lg font-extrabold">
              الطلبات الواردة
            </h2>
            <p dir="ltr" className="text-[11px] text-ink-muted">
              Incoming Orders
            </p>
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
            <span>{transition.error.message}</span>
          </p>
        )}

        <label className="mb-3 flex items-center justify-between rounded-xl bg-brand-surface px-3 py-2 text-xs font-bold text-brand-deep">
          <span>وقت التحضير عند القبول <span dir="ltr" className="font-normal">/ Prep time</span></span>
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
              إجراءات سريعة
            </h2>
            <p dir="ltr" className="text-[11px] text-ink-muted">
              Quick Actions
            </p>
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
                <strong className="block text-xs font-extrabold">{action.ar}</strong>
                <span dir="ltr" className="mt-0.5 block text-micro text-ink-muted">
                  {action.en}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-md px-4 pb-5 pt-7" aria-labelledby="activity-title">
        <div className="mb-4">
          <h2 id="activity-title" className="text-lg font-extrabold">
            النشاط الأخير
          </h2>
          <p dir="ltr" className="text-[11px] text-ink-muted">
            Recent Activity
          </p>
        </div>
        {recentActivity.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-center text-xs text-ink-muted">
            لا يوجد نشاط حديث
            <span dir="ltr" className="ms-1">No recent activity</span>
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
                  <strong className="block text-xs font-bold">{entry.titleAr}</strong>
                  <span className="mt-0.5 block text-micro text-ink-muted" dir="ltr">
                    {entry.titleEn} · {entry.detail}
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
              <h2 id="orders-tab-title" className="text-lg font-extrabold">الطلبات</h2>
              <p dir="ltr" className="text-[11px] text-ink-muted">All active orders</p>
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
              <span>{transition.error.message}</span>
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
            <h2 id="products-tab-title" className="text-lg font-extrabold">المنتجات</h2>
            <p dir="ltr" className="text-[11px] text-ink-muted">Product Catalogue Management</p>
          </div>
          {managedStores.loading && !managedStores.data ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card" aria-busy="true">
              <Loader2 size={22} className="mx-auto animate-spin text-brand" />
              <p className="mt-3 text-sm text-ink-muted">جاري تحميل بيانات المتجر… / Loading store…</p>
            </div>
          ) : managedStores.error && !managedStores.data ? (
            <div className="rounded-2xl border border-danger-tint bg-surface p-6 text-center shadow-card" role="alert">
              <AlertTriangle size={22} className="mx-auto text-danger-ink" />
              <h3 className="mt-3 text-sm font-extrabold">تعذّر تحميل المتجر</h3>
              <p className="mt-1 text-xs text-ink-muted">{managedStores.error.message}</p>
              <button
                type="button"
                onClick={() => managedStores.refresh()}
                disabled={managedStores.refreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-60"
              >
                <RefreshCw size={14} className={managedStores.refreshing ? 'animate-spin' : ''} />
                إعادة المحاولة / Retry
              </button>
            </div>
          ) : managedStoreId ? (
            <ProductCataloguePanel storeId={managedStoreId} />
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
              <p className="text-sm text-ink-muted">
                لا يوجد متجر مرتبط بحسابك — تواصل مع المشرف / No store linked to your account
              </p>
            </div>
          )}
        </section>
      )}

      {/* Store profile tab */}
      {activeTab === 'settings' && (
        <section className="mx-auto max-w-[720px] px-4 pt-7 pb-8" aria-labelledby="profile-tab-title">
          <div className="mb-5">
            <h2 id="profile-tab-title" className="text-lg font-extrabold">إعدادات المتجر</h2>
            <p dir="ltr" className="text-[11px] text-ink-muted">Store Profile &amp; Settings</p>
          </div>
          {managedStores.loading && !managedStores.data ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card" aria-busy="true">
              <Loader2 size={22} className="mx-auto animate-spin text-brand" />
              <p className="mt-3 text-sm text-ink-muted">جاري تحميل بيانات المتجر… / Loading store…</p>
            </div>
          ) : managedStores.error && !managedStores.data ? (
            <div className="rounded-2xl border border-danger-tint bg-surface p-6 text-center shadow-card" role="alert">
              <AlertTriangle size={22} className="mx-auto text-danger-ink" />
              <h3 className="mt-3 text-sm font-extrabold">تعذّر تحميل المتجر</h3>
              <p className="mt-1 text-xs text-ink-muted">{managedStores.error.message}</p>
              <button
                type="button"
                onClick={() => managedStores.refresh()}
                disabled={managedStores.refreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-60"
              >
                <RefreshCw size={14} className={managedStores.refreshing ? 'animate-spin' : ''} />
                إعادة المحاولة / Retry
              </button>
            </div>
          ) : managedStoreId ? (
            <StoreProfilePanel storeId={managedStoreId} />
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
              <p className="text-sm text-ink-muted">
                لا يوجد متجر مرتبط بحسابك — تواصل مع المشرف / No store linked to your account
              </p>
            </div>
          )}
        </section>
      )}

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
              <span className="text-micro font-bold">{tab.ar}</span>
              <span dir="ltr" className="text-micro font-medium">{tab.en}</span>
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
  return (
    <article className="min-w-[126px] flex-1 rounded-2xl border border-line bg-surface p-3 shadow-card">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-brand-tint text-brand">
        {icon}
      </div>
      <p dir="ltr" className="text-micro font-medium text-ink-muted">
        {labelEn}
      </p>
      <p className="mt-0.5 whitespace-nowrap text-[12px] font-bold text-ink-soft">{labelAr}</p>
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
  pending: boolean;
  onAccept: () => void;
  onStartPreparing: () => void;
  onReadyForPickup: () => void;
  onReject: () => void;
}

function OrderRow({ order, pending, onAccept, onStartPreparing, onReadyForPickup, onReject }: OrderRowProps) {
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

  const canCancel = canTransitionOrderStatus(order.status, OrderStatus.CANCELLED);

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between border-b border-line-soft pb-3">
        <div>
          <p dir="ltr" className="text-sm font-extrabold text-ink">
            طلب {order.orderNumber}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-micro text-ink-muted">
            <Clock3 size={12} />
            <span>{time.ar}</span>
            <span dir="ltr" className="text-line">·</span>
            <span dir="ltr">{time.en}</span>
          </p>
        </div>
        <Badge tone={ORDER_STATUS_TONES[order.status]} dot>
          {ORDER_STATUS_LABELS[order.status].ar}
        </Badge>
      </div>
      <div className="py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">{order.storeNameAr}</p>
            <p className="mt-1 text-[11px] text-ink-muted">
              {itemLineAr}
              <span className="mx-1 text-line">·</span>
              <span dir="ltr">{itemLineEn}</span>
            </p>
          </div>
          <p dir="ltr" className="text-base font-extrabold text-ink">
            ₪{order.totalAmount.toFixed(2)}
          </p>
        </div>
        {order.estimatedPrepMinutes !== null && order.estimatedPrepMinutes !== undefined && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-brand-dark" dir="ltr">
            <Clock3 size={13} />
            Estimated prep: {order.estimatedPrepMinutes} min
            <span dir="rtl" className="font-medium text-ink-muted">· مدة التحضير المقدّرة</span>
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
      </div>

      {/* READY_FOR_PICKUP: informational — captain is expected to claim it */}
      {order.status === OrderStatus.READY_FOR_PICKUP && (
        <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-info-tint px-3 py-2 text-[11px] font-semibold text-info-ink">
          <ChevronRight size={14} className="shrink-0 rtl:rotate-180" />
          <span>جاهز — بانتظار كابتن التوصيل</span>
          <span dir="ltr" className="font-normal text-info-ink/75">· Waiting for a captain</span>
        </p>
      )}

      {(primaryAction || canCancel) && (
        <div className={`grid gap-2 ${primaryAction && canCancel ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.handler}
              disabled={pending}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition focus:outline-none focus:ring-2 disabled:opacity-60 ${primaryAction.color}`}
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <primaryAction.icon size={15} />}
              {primaryAction.labelAr}
              <span dir="ltr" className="font-medium opacity-80">{primaryAction.labelEn}</span>
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
              رفض <span dir="ltr" className="font-medium text-danger/70">Cancel</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function EmptyInbox() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
        <Store size={22} />
      </span>
      <h3 className="mt-3 text-sm font-extrabold">لا توجد طلبات واردة</h3>
      <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
        No incoming orders
      </p>
    </div>
  );
}
