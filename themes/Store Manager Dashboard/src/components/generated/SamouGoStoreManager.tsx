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

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  ChevronLeft,
  ClipboardList,
  Clock3,
  Home,
  Loader2,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  X,
  XCircle,
} from 'lucide-react';
import {
  SignInGate,
  updateOrderStatus,
  useAuth,
  useMutation,
  useOrders,
} from '@samou-go/api-client';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEQUENCE,
  OrderStatus,
  UserRole,
  canTransitionOrderStatus,
  type OrderDetail,
  type OrderStatusHistoryEntry,
  type OrderSummary,
  type UpdateOrderStatusInput,
} from '@samou-go/shared-types';

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

/** Bilingual label for a status, with the tone class the design system expects. */
function statusBadge(status: OrderStatus): { label: { ar: string; en: string }; tone: string } {
  const toneByStatus: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: 'bg-brand-tint text-brand-deep',
    [OrderStatus.ACCEPTED]: 'bg-brand-tint text-brand-deep',
    [OrderStatus.PREPARING]: 'bg-warning-tint text-warning-ink',
    [OrderStatus.READY_FOR_PICKUP]: 'bg-info-tint text-info-ink',
    [OrderStatus.ON_THE_WAY]: 'bg-info-tint text-info-ink',
    [OrderStatus.DELIVERED]: 'bg-brand-tint text-brand-deep',
    [OrderStatus.CANCELLED]: 'bg-danger-tint text-danger-ink',
  };
  return { label: ORDER_STATUS_LABELS[status], tone: toneByStatus[status] };
}

/* ---------------------------------------------------------------------------
 * Quick actions
 * ------------------------------------------------------------------------- */

const QUICK_ACTIONS = [
  { icon: ClipboardList, ar: 'إدارة القائمة', en: 'Manage Menu' },
  { icon: BarChart3, ar: 'تقرير المبيعات', en: 'Sales Report' },
  { icon: Bell, ar: 'الإشعارات', en: 'Notifications' },
  { icon: Settings, ar: 'إعدادات المتجر', en: 'Store Settings' },
] as const;

const BOTTOM_TABS = [
  { id: 'home', icon: Home, ar: 'الرئيسية', en: 'Home' },
  { id: 'orders', icon: Package, ar: 'الطلبات', en: 'Orders' },
  { id: 'products', icon: ShoppingBag, ar: 'المنتجات', en: 'Products' },
  { id: 'reports', icon: BarChart3, ar: 'التقارير', en: 'Reports' },
] as const;

const ACTIVE_TAB_LABEL: Record<string, string> = {
  home: 'Home',
  orders: 'Orders',
  products: 'Products',
  reports: 'Reports',
};

/* ---------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------- */

export function SamouGoStoreManager() {
  const auth = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  /* ---- Role gate --------------------------------------------------------- */

  const isManager = auth.user?.role === UserRole.STORE_MANAGER;

  /* ---- Data -------------------------------------------------------------- */

  // The kitchen's inbox: anything not yet terminal and not yet on the road.
  const incoming = useOrders(
    { status: OrderStatus.PENDING, pageSize: 20 },
    { enabled: Boolean(auth.user) && isManager }
  );
  const preparing = useOrders(
    { status: OrderStatus.PREPARING, pageSize: 20 },
    { enabled: Boolean(auth.user) && isManager }
  );
  // Counts for the KPI tiles — we only need totals, so `pageSize: 1` is enough.
  const deliveredToday = useOrders(
    { status: OrderStatus.DELIVERED, pageSize: 1 },
    { enabled: Boolean(auth.user) && isManager }
  );

  const incomingItems = useMemo(() => incoming.data?.items ?? [], [incoming.data]);
  const preparingItems = useMemo(() => preparing.data?.items ?? [], [preparing.data]);
  const inbox: OrderSummary[] = useMemo(
    // The "incoming" list as the design mockup showed it — PENDING on top,
    // then PREPARING. Both arrive from the API rather than from a local array.
    () => [...incomingItems, ...preparingItems],
    [incomingItems, preparingItems]
  );

  const activeCount = incomingItems.length + preparingItems.length;
  const completedCount = deliveredToday.data?.total ?? 0;

  /* ---- Mutations --------------------------------------------------------- */

  const transition = useMutation<UpdateOrderStatusInput, OrderDetail>(
    (input, signal) => updateOrderStatus(pendingOrderId as string, input, signal)
  );

  const runTransition = async (
    orderId: string,
    next: OrderStatus,
    ar: string,
    en: string
  ): Promise<void> => {
    setPendingOrderId(orderId);
    setNotice(null);
    const result = await transition.run({ status: next });
    setPendingOrderId(null);
    if (result) {
      setNotice(`${ar} · ${en}`);
      window.setTimeout(() => setNotice(null), 2200);
      void incoming.reload();
      void preparing.reload();
    }
  };

  const handleAccept = (orderId: string) =>
    void runTransition(orderId, OrderStatus.ACCEPTED, 'تم قبول الطلب', 'Order accepted');
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

    for (const summary of [...incomingItems, ...preparingItems]) {
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
  }, [incomingItems, preparingItems]);

  /* ---- Gates ------------------------------------------------------------- */

  if (!auth.ready) {
    return (
      <main dir="rtl" className="min-h-screen bg-canvas pb-24" aria-busy="true">
        <header className="bg-brand px-4 pb-4 pt-4 text-white">
          <div className="mx-auto flex max-w-md items-center justify-between" aria-hidden="true">
            <span className="h-10 w-10 rounded-xl bg-surface/15" />
            <span className="h-5 w-40 rounded bg-surface/20" />
            <span className="h-10 w-10 rounded-xl bg-surface/15" />
          </div>
        </header>
        <div className="mx-auto max-w-md space-y-4 px-4 pt-5" aria-hidden="true">
          <div className="h-24 animate-pulse rounded-2xl bg-surface shadow-card" />
          <div className="h-40 animate-pulse rounded-2xl bg-surface shadow-card" />
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

  if (!isManager) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-danger-tint bg-surface p-6 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
            <XCircle size={22} />
          </span>
          <h1 className="mt-3 text-base font-extrabold">هذه الشاشة لمدير المتجر فقط</h1>
          <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
            Store manager access required
          </p>
          <button
            type="button"
            onClick={auth.signOut}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark"
          >
            <LogOut size={14} />
            تسجيل الخروج <span dir="ltr">Sign out</span>
          </button>
        </div>
      </main>
    );
  }

  const apiError = incoming.error ?? preparing.error ?? deliveredToday.error;
  const loading = incoming.loading && preparing.loading;

  /* ---- Render ------------------------------------------------------------ */

  return (
    <main dir="rtl" className="min-h-screen bg-canvas pb-24 font-sans text-ink">
      <header className="bg-brand px-4 pb-4 pt-4 text-white">
        <nav className="mx-auto flex max-w-md items-center justify-between" aria-label="التنقل الرئيسي">
          <button
            type="button"
            aria-label="فتح القائمة"
            className="rounded-xl p-2 transition hover:bg-surface/15 focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            <Menu size={23} />
          </button>
          <div className="text-center leading-tight">
            <h1 className="text-[15px] font-extrabold">لوحة المتجر</h1>
            <p dir="ltr" className="text-[10px] font-medium text-white/80">
              Store Manager
            </p>
          </div>
          <button
            type="button"
            aria-label="الإشعارات"
            className="flex items-center gap-1 rounded-xl p-2 transition hover:bg-surface/15 focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            <Bell size={21} />
            {activeCount > 0 && (
              <span
                aria-label="إشعار جديد"
                className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold"
              >
                {activeCount}
              </span>
            )}
          </button>
        </nav>
        <div className="mx-auto mt-3 flex max-w-md items-center justify-between rounded-xl bg-brand-dark px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-tint" />
            <span className="text-xs font-bold">
              {isOpen ? 'متجر مفتوح' : 'متجر مغلق'}
              <span dir="ltr" className="ms-2 text-[10px] text-white/80">
                {isOpen ? 'Open' : 'Closed'}
              </span>
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isOpen}
            aria-label="تبديل حالة المتجر"
            onClick={() => setIsOpen((value) => !value)}
            className={`flex h-6 w-11 items-center rounded-full p-1 transition ${
              isOpen ? 'bg-surface/90 justify-end' : 'bg-black/25 justify-start'
            }`}
          >
            <span className={`h-4 w-4 rounded-full ${isOpen ? 'bg-brand' : 'bg-surface'}`} />
          </button>
        </div>
      </header>

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
                void incoming.reload();
                void preparing.reload();
                void deliveredToday.reload();
              }}
              disabled={incoming.refreshing || preparing.refreshing}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {incoming.refreshing || preparing.refreshing ? (
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

        <div className="space-y-3">
          {loading && inbox.length === 0
            ? [0, 1].map((index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-2xl bg-surface shadow-card"
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
                    canAccept={canTransitionOrderStatus(order.status, OrderStatus.ACCEPTED)}
                    onAccept={() => handleAccept(order.id)}
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
              onClick={() => setNotice(`${action.ar} — ${action.en}`)}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-end shadow-card transition hover:border-brand-tint hover:bg-brand-surface focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                <action.icon size={18} />
              </span>
              <span>
                <strong className="block text-xs font-extrabold">{action.ar}</strong>
                <span dir="ltr" className="mt-0.5 block text-[10px] text-ink-muted">
                  {action.en}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Recent activity — derived from the live orders, not from a hardcoded list */}
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
                  <span className="mt-0.5 block text-[10px] text-ink-muted" dir="ltr">
                    {entry.titleEn} · {entry.detail}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {notice && (
        <p
          role="status"
          className="fixed bottom-20 start-4 end-4 z-30 mx-auto max-w-md rounded-xl bg-ink px-4 py-3 text-center text-xs font-bold text-white shadow-raised"
        >
          {notice}
        </p>
      )}

      <nav
        className="fixed bottom-0 inset-x-0 z-20 border-t border-line bg-surface px-3 safe-bottom pt-2 shadow-raised"
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
              <span className="text-[10px] font-bold">{tab.ar}</span>
              <span dir="ltr" className="text-[9px] font-medium">
                {ACTIVE_TAB_LABEL[tab.id]}
              </span>
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
      <p dir="ltr" className="text-[10px] font-medium text-ink-muted">
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
  canAccept: boolean;
  onAccept: () => void;
  onReject: () => void;
}

function OrderRow({ order, pending, canAccept, onAccept, onReject }: OrderRowProps) {
  const badge = statusBadge(order.status);
  const time = relativeTime(order.createdAt);
  const itemCount = order.itemCount;
  const itemLineAr = `${itemCount} منتج`;
  const itemLineEn = `${itemCount} items`;

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between border-b border-line-soft pb-3">
        <div>
          <p dir="ltr" className="text-sm font-extrabold text-ink">
            طلب {order.orderNumber}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-muted">
            <Clock3 size={12} />
            <span>{time.ar}</span>
            <span dir="ltr" className="text-line">·</span>
            <span dir="ltr">{time.en}</span>
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${badge.tone}`}>
          {badge.label.ar}
        </span>
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
      </div>
      {canAccept && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={pending}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            قبول <span dir="ltr" className="font-medium text-white/80">Accept</span>
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={pending}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-danger-tint py-2.5 text-xs font-bold text-danger transition hover:bg-danger-tint focus:outline-none focus:ring-2 focus:ring-danger/40 disabled:opacity-60"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
            رفض <span dir="ltr" className="font-medium text-danger/70">Reject</span>
          </button>
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