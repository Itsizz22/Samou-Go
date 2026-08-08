/**
 * Samou' Go — Admin Dashboard.
 *
 * Every number and row here is real API data: the KPI grid comes from the
 * single `GET /admin/stats` aggregate, the management panels drive `GET /users`,
 * `GET /stores` and `GET /orders`, and every write goes through the documented
 * admin endpoints (`PATCH /users/:id`, `PATCH /captains/:id/verify`,
 * `PATCH /stores/:id/approve`, `PATCH /orders/:id/status`).
 *
 * The sidebar drives the content below it — no separate admin routes exist, so
 * panels are swapped in place instead of navigating.
 *
 * Auth gate: ADMIN role required. Any other role sees an access-denied screen.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Truck,
  Users,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import {
  SignInGate,
  approveStore,
  updateOrderStatus,
  updateStore,
  updateUser,
  useAdminStats,
  useAuth,
  useMutation,
  useOrders,
  useStores,
  useToast,
  useUsers,
  verifyCaptain,
} from '@/hooks/useApi';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  ORDER_STATUS_TRANSITIONS,
  USER_ROLE_LABELS,
  OrderStatus,
  UserRole,
  type OrderDetail,
  type OrderSummary,
  type PublicUser,
  type Store as StoreModel,
  type UpdateOrderStatusInput,
  type UpdateUserInput,
} from '@samou-go/shared-types';
import { NotificationBell, type BellNotification } from '@samou-go/ui';

/* ---------------------------------------------------------------------------
 * Shared bits
 * ------------------------------------------------------------------------- */

const NAV_ITEMS = [
  { id: 'Dashboard', ar: 'لوحة التحكم', icon: ClipboardList },
  { id: 'Orders', ar: 'الطلبات', icon: Package },
  { id: 'Users', ar: 'المستخدمون', icon: Users },
  { id: 'Stores', ar: 'المتاجر', icon: Store },
  { id: 'Captains', ar: 'السائقون', icon: Truck },
] as const;

const TONE_CLASSES: Record<string, string> = {
  brand: 'bg-brand-tint text-brand-dark',
  warning: 'bg-warning-tint text-warning-ink',
  info: 'bg-info-tint text-info-ink',
  danger: 'bg-danger-tint text-danger-ink',
  neutral: 'bg-canvas text-ink-muted',
};

function statusBadgeClass(status: OrderStatus): string {
  return TONE_CLASSES[ORDER_STATUS_TONES[status]] ?? TONE_CLASSES.neutral!;
}

function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatILS(amount: number): string {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ₪`;
}

/* ---------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------- */

export function SamouGoAdminDashboard() {
  const auth = useAuth();
  const toast = useToast();
  const [activeNav, setActiveNav] = useState<string>('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = auth.user?.role === UserRole.ADMIN;

  // The whole KPI grid in one round-trip, polled so the dashboard stays live.
  const stats = useAdminStats({ enabled: isAdmin, pollMs: 15_000 });

  /* ---- Bell notifications derived from the stats aggregate ----------------- */

  const bellNotifications: BellNotification[] = useMemo(() => {
    const list: BellNotification[] = [];
    const pending = stats.data?.stores.pendingApproval ?? 0;
    if (pending > 0) {
      list.push({
        id: 'stores-pending',
        ar: `${pending} متجر بانتظار موافقتك`,
        en: `${pending} store${pending === 1 ? '' : 's'} awaiting approval`,
        tone: 'warning',
      });
    }
    const unverified = (stats.data?.captains.total ?? 0) - (stats.data?.captains.verified ?? 0);
    if (unverified > 0) {
      list.push({
        id: 'captains-unverified',
        ar: `${unverified} كابتن غير موثّق`,
        en: `${unverified} unverified captain${unverified === 1 ? '' : 's'}`,
        tone: 'danger',
      });
    }
    return list;
  }, [stats.data]);

  /* ---- Gates -------------------------------------------------------------- */

  if (!auth.ready) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 size={32} className="animate-spin text-brand" aria-label="Loading" />
      </main>
    );
  }

  if (!auth.user) {
    return (
      <SignInGate
        auth={auth}
        reasonAr="سجّل الدخول للوصول إلى لوحة الإدارة"
        reasonEn="Sign in to access the admin dashboard"
      />
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5">
        <div className="w-full max-w-sm rounded-2xl border border-danger-tint bg-surface p-6 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
            <XCircle size={22} />
          </span>
          <h1 className="mt-3 text-base font-extrabold">لوحة الإدارة — للمشرفين فقط</h1>
          <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">Admin access required</p>
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

  /* ---- Render -------------------------------------------------------------- */

  return (
    <main dir="rtl" className="min-h-screen bg-canvas font-sans text-ink">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 start-0 z-30 flex w-[244px] flex-col bg-brand-deep px-4 py-6 text-white transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
        aria-label="Admin sidebar"
      >
        <div className="flex items-center gap-3 px-3 pb-9" dir="ltr">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-brand">
            <ShoppingBag size={22} strokeWidth={2.6} />
          </span>
          <span>
            <strong className="block text-[18px] tracking-[-0.03em]">Samou' Go</strong>
            <span className="block text-[10px] font-medium text-white/70">السموع جو · ADMIN</span>
          </span>
          <button
            type="button"
            className="ms-auto rounded-lg p-1 text-white/80 hover:bg-surface/10 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1" aria-label="Primary navigation">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
            Workspace
          </p>
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => { setActiveNav(item.id); setSidebarOpen(false); }}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition ${
                      active ? 'bg-brand text-white shadow-raised' : 'text-white/75 hover:bg-surface/10 hover:text-white'
                    }`}
                  >
                    <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                    <span className="flex-1 text-[13px] font-semibold">{item.id}</span>
                    <span dir="rtl" className={`text-[12px] ${active ? 'text-white/85' : 'text-white/65'}`}>
                      {item.ar}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-white/10 pt-5">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-sm font-extrabold text-brand-deep">
              {auth.user.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-[12px]">{auth.user.name}</strong>
              <span className="block truncate text-[11px] text-white/70">مدير النظام</span>
            </span>
            <button
              type="button"
              onClick={auth.signOut}
              aria-label="Sign out"
              className="ms-auto rounded-lg p-1 text-white/70 transition hover:bg-surface/10 hover:text-white"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <section className="min-h-screen lg:ps-[244px]">
        <header className="sticky top-0 z-20 flex min-h-[78px] items-center justify-between border-b border-line bg-surface/95 px-5 shadow-card backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-brand-deep hover:bg-brand-surface lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={21} />
            </button>
            <div>
              <h1 className="text-[18px] font-extrabold tracking-[-0.02em] md:text-[21px]">
                {activeNav} <span className="font-semibold text-ink-muted">/ {NAV_ITEMS.find((n) => n.id === activeNav)?.ar}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            <button
              type="button"
              onClick={() => void stats.reload()}
              disabled={stats.refreshing}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-brand hover:bg-brand-surface disabled:opacity-60"
              aria-label="Refresh dashboard data"
            >
              {stats.refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span className="hidden sm:inline">تحديث / Refresh</span>
            </button>
            <NotificationBell notifications={bellNotifications} storageKey="admin" max={6} />
            <span className="hidden h-8 w-px bg-line md:block" />
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-xs font-extrabold text-brand-dark">
                {auth.user.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden text-end md:block">
                <strong className="block text-xs">{auth.user.name}</strong>
                <span dir="rtl" className="block text-[10px] text-ink-muted">مدير النظام</span>
              </span>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-9">
          {activeNav === 'Dashboard' && (
            <DashboardTab stats={stats.data} loading={stats.loading} error={stats.error} onRetry={() => void stats.reload()} />
          )}
          {activeNav === 'Orders' && <OrdersPanel />}
          {activeNav === 'Users' && <UsersPanel />}
          {activeNav === 'Stores' && <StoresPanel />}
          {activeNav === 'Captains' && <CaptainsPanel />}
        </div>
      </section>
    </main>
  );
}

/* ---------------------------------------------------------------------------
 * Dashboard tab — KPI grid + recent orders + activity (all from AdminStats)
 * ------------------------------------------------------------------------- */

interface DashboardTabProps {
  stats: ReturnType<typeof useAdminStats>['data'];
  loading: boolean;
  error: ReturnType<typeof useAdminStats>['error'];
  onRetry: () => void;
}

function DashboardTab({ stats, loading, error, onRetry }: DashboardTabProps) {
  const kpis = [
    {
      label: 'Revenue Today',
      ar: 'إيرادات اليوم',
      icon: WalletCards,
      display: stats ? formatILS(stats.revenue.today) : '—',
    },
    {
      label: 'Total Orders',
      ar: 'إجمالي الطلبات',
      icon: ClipboardList,
      display: stats ? String(stats.orders.total) : '—',
    },
    {
      label: 'Active Deliveries',
      ar: 'توصيل نشط',
      icon: Truck,
      display: stats ? String(stats.orders.active) : '—',
    },
    {
      label: 'Online Captains',
      ar: 'كابتن متاح',
      icon: Users,
      display: stats ? `${stats.captains.online} / ${stats.captains.total}` : '—',
    },
  ] as const;

  const recent = stats?.recentOrders ?? [];

  return (
    <>
      <section aria-labelledby="overview-title">
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand">Overview</p>
          <h2 id="overview-title" className="mt-1 text-[20px] font-extrabold tracking-[-0.025em]">
            نظرة عامة <span dir="ltr" className="font-semibold text-ink-muted">/ Overview</span>
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <article key={kpi.label} className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand">
                    <Icon size={20} />
                  </span>
                </div>
                <p dir="ltr" className="mt-5 text-[26px] font-extrabold leading-none tracking-[-0.04em] text-ink">
                  {loading && !stats ? (
                    <span className="inline-block h-8 w-16 animate-pulse rounded bg-line-soft" aria-hidden="true" />
                  ) : (
                    kpi.display
                  )}
                </p>
                <p className="mt-2 text-xs font-semibold text-ink-soft">{kpi.label}</p>
                <p dir="rtl" className="mt-0.5 text-[11px] text-ink-subtle">{kpi.ar}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 grid-cols-2 xl:grid-cols-4">
          <StatusKpi label="بانتظار الموافقة" en="Pending" count={stats?.orders.byStatus[OrderStatus.PENDING] ?? 0} tone="warning" />
          <StatusKpi label="جاهز للاستلام" en="Ready" count={stats?.orders.byStatus[OrderStatus.READY_FOR_PICKUP] ?? 0} tone="info" />
          <StatusKpi label="متاجر بانتظار الموافقة" en="Stores awaiting approval" count={stats?.stores.pendingApproval ?? 0} tone="warning" />
          <StatusKpi label="المتاجر النشطة" en="Active stores" count={stats?.stores.active ?? 0} tone="brand" />
          <StatusKpi label="إجمالي المستخدمين" en="Registered users" count={stats?.users.total ?? 0} tone="brand" />
        </div>
      </section>

      {error && (
        <section className="mt-6" aria-live="assertive">
          <div className="rounded-xl border border-danger-tint bg-surface p-5 text-center shadow-card">
            <AlertTriangle className="mx-auto text-danger" size={22} />
            <p className="mt-2 text-xs font-semibold text-danger-ink">{error.message}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-dark"
            >
              <RefreshCw size={12} /> إعادة المحاولة
            </button>
          </div>
        </section>
      )}

      {!error && (
        <section className="mt-7 grid gap-5 xl:grid-cols-[1.55fr_1fr]" aria-label="Recent orders and activity">
          <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-5">
              <div>
                <h2 className="text-[15px] font-extrabold">أحدث الطلبات</h2>
                <p dir="ltr" className="mt-1 text-[11px] text-ink-muted">Recent Orders</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-start">
                <thead className="bg-canvas text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                  <tr>
                    <th className="px-5 py-3">Order ID</th>
                    <th className="px-3 py-3">Store</th>
                    <th className="px-3 py-3">Items</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Time</th>
                    <th className="px-5 py-3 text-end">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {loading && !stats
                    ? [0, 1, 2, 3, 4].map((i) => (
                        <tr key={i} aria-hidden="true">
                          {[0, 1, 2, 3, 4, 5].map((j) => (
                            <td key={j} className="px-5 py-4">
                              <div className="h-3 animate-pulse rounded bg-line-soft" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : recent.map((order) => (
                        <tr key={order.id} className="text-xs hover:bg-canvas">
                          <td className="px-5 py-4 font-bold text-brand-deep" dir="ltr">{order.orderNumber}</td>
                          <td className="px-3 py-4 text-ink-muted">{order.storeNameAr}</td>
                          <td className="px-3 py-4 text-ink-muted">{order.itemCount}</td>
                          <td className="px-3 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${statusBadgeClass(order.status)}`}>
                              {ORDER_STATUS_LABELS[order.status].ar}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-ink-muted" dir="ltr">{shortTime(order.createdAt)}</td>
                          <td className="px-5 py-4 text-end font-extrabold text-brand-deep" dir="ltr">
                            {formatILS(order.totalAmount)}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
              {!loading && recent.length === 0 && (
                <p className="py-8 text-center text-xs text-ink-muted">لا توجد طلبات حتى الآن</p>
              )}
            </div>
          </article>

          <article className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <div>
              <h2 className="text-[15px] font-extrabold">الطلبات حسب الحالة</h2>
              <p dir="ltr" className="mt-1 text-[11px] text-ink-muted">Orders by status</p>
            </div>
            <ul className="mt-5 space-y-3">
              {Object.values(OrderStatus).map((status) => {
                const count = stats?.orders.byStatus[status] ?? 0;
                const total = stats?.orders.total ?? 1;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <li key={status}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-ink-soft">
                        {ORDER_STATUS_LABELS[status].ar}
                        <span dir="ltr" className="ms-1 font-medium text-ink-subtle">· {ORDER_STATUS_LABELS[status].en}</span>
                      </span>
                      <span className="font-extrabold text-ink" dir="ltr">{count} ({pct}%)</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        </section>
      )}
    </>
  );
}

function StatusKpi({ label, en, count, tone }: { label: string; en: string; count: number; tone: 'brand' | 'warning' | 'info' | 'danger' }) {
  const tint: Record<string, string> = {
    brand: 'bg-brand-tint text-brand-deep',
    warning: 'bg-warning-tint text-warning-ink',
    info: 'bg-info-tint text-info-ink',
    danger: 'bg-danger-tint text-danger-ink',
  };
  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="text-[20px] font-extrabold text-ink" dir="ltr">{count}</p>
      <p className="mt-1 text-xs font-bold text-ink-soft">{label}</p>
      <p dir="ltr" className="mt-0.5 text-[10px] text-ink-subtle">{en}</p>
      <span className={`mt-2 inline-block h-1.5 w-8 rounded-full ${tint[tone]}`} />
    </article>
  );
}

/* ---------------------------------------------------------------------------
 * Orders panel — live table with an ADMIN status override per row
 * ------------------------------------------------------------------------- */

function OrdersPanel() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const orders = useOrders({ page, pageSize: 20 }, { pollMs: 10_000 });
  const rows = orders.data?.items ?? [];

  const pendingIdRef = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const transition = useMutation<UpdateOrderStatusInput, OrderDetail>(
    (input, signal) => updateOrderStatus(pendingIdRef.current as string, input, signal)
  );

  const overrideStatus = async (orderId: string, status: OrderStatus) => {
    pendingIdRef.current = orderId;
    setPendingId(orderId);
    const result = await transition.run({ status });
    pendingIdRef.current = null;
    setPendingId(null);
    if (result) {
      toast.success(`تم تغيير حالة ${result.orderNumber}`, `Order ${result.orderNumber} moved to ${ORDER_STATUS_LABELS[status].en}`);
      void orders.reload();
    } else if (transition.error) {
      toast.error('تعذّر تغيير الحالة', transition.error.message, { duration: 5_000 });
    }
  };

  return (
    <PanelShell
      title="الطلبات المباشرة"
      en="Live Orders"
      loading={orders.loading}
      error={orders.error}
      refreshing={orders.refreshing}
      onRefresh={() => void orders.reload()}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-start">
          <thead className="bg-canvas text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-5 py-3">Order ID</th>
              <th className="px-3 py-3">Store</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Override</th>
              <th className="px-5 py-3 text-end">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {orders.loading && rows.length === 0
              ? [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 animate-pulse rounded bg-line-soft" /></td>
                    ))}
                  </tr>
                ))
              : rows.map((order) => {
                  const next = ORDER_STATUS_TRANSITIONS[order.status];
                  const legal = next.filter((status) => ORDER_STATUS_TONES[status]);
                  const busy = pendingId === order.id && transition.pending;
                  return (
                    <tr key={order.id} className="text-xs hover:bg-canvas">
                      <td className="px-5 py-3 font-bold text-brand-deep" dir="ltr">{order.orderNumber}</td>
                      <td className="px-3 py-3 text-ink-muted">{order.storeNameAr}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${statusBadgeClass(order.status)}`}>
                          {ORDER_STATUS_LABELS[order.status].ar}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {legal.length === 0 ? (
                          <span className="text-[10px] text-ink-subtle">—</span>
                        ) : (
                          <select
                            value=""
                            disabled={busy}
                            onChange={(e) => {
                              const value = e.target.value as OrderStatus;
                              if (value) void overrideStatus(order.id, value);
                            }}
                            className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-[11px] font-semibold text-ink outline-none focus:border-brand disabled:opacity-60"
                            aria-label={`Override status for ${order.orderNumber}`}
                          >
                            <option value="" disabled>{busy ? '…' : 'تحويل إلى / Move to…'}</option>
                            {legal.map((status) => (
                              <option key={status} value={status}>{ORDER_STATUS_LABELS[status].ar} / {ORDER_STATUS_LABELS[status].en}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-3 text-end font-extrabold text-brand-deep" dir="ltr">
                        {formatILS(order.totalAmount)}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!orders.loading && rows.length === 0 && (
          <p className="py-8 text-center text-xs text-ink-muted">لا توجد طلبات حتى الآن</p>
        )}
      </div>
      {orders.data && orders.data.totalPages > 1 && (
        <PaginationBar
          page={orders.data.page}
          totalPages={orders.data.totalPages}
          total={orders.data.total}
          disabled={orders.loading}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(orders.data?.totalPages ?? p, p + 1))}
        />
      )}
    </PanelShell>
  );
}

/* ---------------------------------------------------------------------------
 * Users panel — freeze/activate, change role
 * ------------------------------------------------------------------------- */

function UsersPanel() {
  const toast = useToast();
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter/search change restarts from the first page.
  useEffect(() => {
    setPage(1);
  }, [roleFilter, debounced]);

  const users = useUsers({
    page,
    pageSize: 50,
    ...(roleFilter === 'ALL' ? {} : { role: roleFilter }),
    ...(debounced ? { search: debounced } : {}),
  });
  const rows = users.data?.items ?? [];

  const pendingIdRef = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const updateMutation = useMutation<UpdateUserInput, PublicUser>(
    (input, signal) => updateUser(pendingIdRef.current as string, input, signal)
  );

  const runUpdate = async (id: string, input: UpdateUserInput, successAr: string, successEn: string) => {
    pendingIdRef.current = id;
    setPendingId(id);
    const result = await updateMutation.run(input);
    pendingIdRef.current = null;
    setPendingId(null);
    if (result) {
      toast.success(successAr, successEn);
      void users.reload();
    } else if (updateMutation.error) {
      toast.error('تعذّر تحديث المستخدم', updateMutation.error.message, { duration: 5_000 });
    }
  };

  const toggleActive = (user: PublicUser) => {
    if (user.role === UserRole.ADMIN) {
      toast.error('لا يمكن تعطيل حساب مشرف', 'You cannot deactivate an admin account');
      return;
    }
    void runUpdate(
      user.id,
      { isActive: !user.isActive },
      user.isActive ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب',
      user.isActive ? 'Account deactivated' : 'Account activated'
    );
  };

  const changeRole = (user: PublicUser, role: UserRole) => {
    void runUpdate(
      user.id,
      { role },
      `تم تغيير الدور إلى ${USER_ROLE_LABELS[role].ar}`,
      `Role changed to ${USER_ROLE_LABELS[role].en}`
    );
  };

  return (
    <PanelShell
      title="المستخدمون"
      en="All Users"
      loading={users.loading}
      error={users.error}
      refreshing={users.refreshing}
      onRefresh={() => void users.reload()}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-ink-muted sm:w-[220px]">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs outline-none placeholder:text-ink-subtle"
              placeholder="ابحث بالاسم أو الجوال / Search name or phone…"
              aria-label="Search users"
            />
          </label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'ALL' | UserRole)}
            className="h-9 rounded-xl border border-line bg-canvas px-2 text-xs font-semibold text-ink outline-none focus:border-brand"
            aria-label="Filter by role"
          >
            <option value="ALL">كل الأدوار / All roles</option>
            {(Object.keys(UserRole) as UserRole[]).map((role) => (
              <option key={role} value={role}>{USER_ROLE_LABELS[role].ar} / {USER_ROLE_LABELS[role].en}</option>
            ))}
          </select>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-start">
          <thead className="bg-canvas text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-5 py-3">User</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {users.loading && rows.length === 0
              ? [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 animate-pulse rounded bg-line-soft" /></td>
                    ))}
                  </tr>
                ))
              : rows.map((user) => {
                  const busy = pendingId === user.id && updateMutation.pending;
                  return (
                    <tr key={user.id} className="text-xs hover:bg-canvas">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[10px] font-extrabold text-brand-deep">
                            {user.name.slice(0, 2)}
                          </span>
                          <span className="font-bold text-ink">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-muted" dir="ltr">{user.phone}</td>
                      <td className="px-3 py-3">
                        <select
                          value={user.role}
                          disabled={busy || user.role === UserRole.ADMIN}
                          onChange={(e) => changeRole(user, e.target.value as UserRole)}
                          className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-[11px] font-semibold text-ink outline-none focus:border-brand disabled:opacity-60"
                          aria-label={`Role for ${user.name}`}
                        >
                          {(Object.keys(UserRole) as UserRole[]).map((role) => (
                            <option key={role} value={role}>{USER_ROLE_LABELS[role].ar}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          user.isActive ? 'bg-brand-tint text-brand-deep' : 'bg-danger-tint text-danger-ink'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? 'bg-brand' : 'bg-danger'}`} />
                          {user.isActive ? 'نشط' : 'موقوف'}
                          {user.role === UserRole.CAPTAIN && (user.isVerified ? ' · موثّق' : ' · غير موثّق')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-end">
                        <button
                          type="button"
                          disabled={busy || user.role === UserRole.ADMIN}
                          onClick={() => toggleActive(user)}
                          className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-danger-tint hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : user.isActive ? 'تعطيل' : 'تفعيل'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!users.loading && rows.length === 0 && (
          <p className="py-8 text-center text-xs text-ink-muted">لا يوجد مستخدمون مطابقون</p>
        )}
      </div>
      {users.data && users.data.totalPages > 1 && (
        <PaginationBar
          page={users.data.page}
          totalPages={users.data.totalPages}
          total={users.data.total}
          disabled={users.loading}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(users.data?.totalPages ?? p, p + 1))}
        />
      )}
    </PanelShell>
  );
}

/* ---------------------------------------------------------------------------
 * Stores panel — approve pending stores, toggle active status
 * ------------------------------------------------------------------------- */

function StoresPanel() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const stores = useStores({ activeOnly: false, page, pageSize: 50 });
  const rows = stores.data?.items ?? [];

  const pendingIdRef = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const approveMutation = useMutation<null, StoreModel>((_, signal) => approveStore(pendingIdRef.current as string, signal));
  const toggleMutation = useMutation<{ isActive: boolean }, StoreModel>(
    (input, signal) => updateStore(pendingIdRef.current as string, input, signal)
  );

  const runAction = async (id: string, action: () => Promise<StoreModel | null>, successAr: string, successEn: string) => {
    pendingIdRef.current = id;
    setPendingId(id);
    const result = await action();
    pendingIdRef.current = null;
    setPendingId(null);
    if (result) {
      toast.success(successAr, successEn);
      void stores.reload();
    } else if (approveMutation.error || toggleMutation.error) {
      const message = approveMutation.error?.message ?? toggleMutation.error?.message;
      toast.error('تعذّر تحديث المتجر', message ?? 'Unknown error', { duration: 5_000 });
    }
  };

  return (
    <PanelShell
      title="المتاجر"
      en="Registered Stores"
      loading={stores.loading}
      error={stores.error}
      refreshing={stores.refreshing}
      onRefresh={() => void stores.reload()}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-start">
          <thead className="bg-canvas text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-5 py-3">Store</th>
              <th className="px-3 py-3">Approval</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {stores.loading && rows.length === 0
              ? [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} aria-hidden="true">
                    {[0, 1, 2, 3].map((j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 animate-pulse rounded bg-line-soft" /></td>
                    ))}
                  </tr>
                ))
              : rows.map((store) => {
                  const busy = pendingId === store.id;
                  return (
                    <tr key={store.id} className="text-xs hover:bg-canvas">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-tint text-[10px] font-extrabold text-brand-deep">
                            {store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" /> : store.nameAr.slice(0, 2)}
                          </span>
                          <span>
                            <strong className="block font-bold text-ink">{store.nameAr}</strong>
                            <span className="block text-[10px] text-ink-subtle" dir="ltr">{store.nameEn}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {store.isApproved ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-bold text-brand-deep">
                            <BadgeCheck size={12} /> موافق عليه
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-warning-tint px-2.5 py-1 text-[10px] font-bold text-warning-ink">
                            بانتظار الموافقة
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          store.isActive ? 'bg-brand-tint text-brand-deep' : 'bg-canvas text-ink-muted'
                        }`}>
                          {store.isActive ? 'مفتوح' : 'مغلق'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!store.isApproved && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void runAction(store.id, () => approveMutation.run(null), 'تمت الموافقة على المتجر', 'Store approved')}
                              className="rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
                            >
                              {busy && approveMutation.pending ? <Loader2 size={12} className="animate-spin" /> : 'موافقة'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(
                              store.id,
                              () => toggleMutation.run({ isActive: !store.isActive }),
                              store.isActive ? 'تم إغلاق المتجر' : 'تم فتح المتجر',
                              store.isActive ? 'Store closed' : 'Store opened'
                            )}
                            className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-brand hover:bg-brand-surface hover:text-brand-deep disabled:opacity-50"
                          >
                            {busy && toggleMutation.pending ? <Loader2 size={12} className="animate-spin" /> : store.isActive ? 'إغلاق' : 'فتح'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!stores.loading && rows.length === 0 && (
          <p className="py-8 text-center text-xs text-ink-muted">لا توجد متاجر</p>
        )}
      </div>
      {stores.data && stores.data.totalPages > 1 && (
        <PaginationBar
          page={stores.data.page}
          totalPages={stores.data.totalPages}
          total={stores.data.total}
          disabled={stores.loading}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(stores.data?.totalPages ?? p, p + 1))}
        />
      )}
    </PanelShell>
  );
}

/* ---------------------------------------------------------------------------
 * Captains panel — verify accounts, freeze, watch availability
 * ------------------------------------------------------------------------- */

function CaptainsPanel() {
  const toast = useToast();
  const captains = useUsers({ role: UserRole.CAPTAIN, pageSize: 50 });
  const rows = captains.data?.items ?? [];

  const pendingIdRef = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const verifyMutation = useMutation<null, PublicUser>((_, signal) => verifyCaptain(pendingIdRef.current as string, signal));
  const updateMutation = useMutation<UpdateUserInput, PublicUser>(
    (input, signal) => updateUser(pendingIdRef.current as string, input, signal)
  );

  const runAction = async (id: string, action: () => Promise<PublicUser | null>, successAr: string, successEn: string) => {
    pendingIdRef.current = id;
    setPendingId(id);
    const result = await action();
    pendingIdRef.current = null;
    setPendingId(null);
    if (result) {
      toast.success(successAr, successEn);
      void captains.reload();
    } else if (verifyMutation.error || updateMutation.error) {
      const message = verifyMutation.error?.message ?? updateMutation.error?.message;
      toast.error('تعذّر تحديث الكابتن', message ?? 'Unknown error', { duration: 5_000 });
    }
  };

  const onlineCount = rows.filter((c) => c.isActive && c.isAvailable).length;

  return (
    <PanelShell
      title={`كابتن التوصيل (${rows.length})`}
      en={`Delivery Captains — ${onlineCount} online`}
      loading={captains.loading}
      error={captains.error}
      refreshing={captains.refreshing}
      onRefresh={() => void captains.reload()}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-start">
          <thead className="bg-canvas text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-5 py-3">Captain</th>
              <th className="px-3 py-3">Verification</th>
              <th className="px-3 py-3">Availability</th>
              <th className="px-5 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {captains.loading && rows.length === 0
              ? [0, 1, 2].map((i) => (
                  <tr key={i} aria-hidden="true">
                    {[0, 1, 2, 3].map((j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 animate-pulse rounded bg-line-soft" /></td>
                    ))}
                  </tr>
                ))
              : rows.map((captain) => {
                  const busy = pendingId === captain.id;
                  return (
                    <tr key={captain.id} className="text-xs hover:bg-canvas">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[10px] font-extrabold text-brand-deep">
                            {captain.name.slice(0, 2)}
                          </span>
                          <span>
                            <strong className="block font-bold text-ink">{captain.name}</strong>
                            <span className="block text-[10px] text-ink-subtle" dir="ltr">{captain.phone}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {captain.isVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-bold text-brand-deep">
                            <BadgeCheck size={12} /> موثّق
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-warning-tint px-2.5 py-1 text-[10px] font-bold text-warning-ink">
                            غير موثّق
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          captain.isActive && captain.isAvailable ? 'bg-brand-tint text-brand-deep' : 'bg-canvas text-ink-muted'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${captain.isActive && captain.isAvailable ? 'bg-brand' : 'bg-ink-subtle'}`} />
                          {!captain.isActive ? 'موقوف' : captain.isAvailable ? 'متاح' : 'غير متاح'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!captain.isVerified && (
                            <button
                              type="button"
                              disabled={busy || !captain.isActive}
                              onClick={() => void runAction(captain.id, () => verifyMutation.run(null), 'تم توثيق الكابتن', 'Captain verified')}
                              className="rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
                            >
                              {busy && verifyMutation.pending ? <Loader2 size={12} className="animate-spin" /> : 'توثيق'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(
                              captain.id,
                              () => updateMutation.run({ isActive: !captain.isActive }),
                              captain.isActive ? 'تم تعطيل الكابتن' : 'تم تفعيل الكابتن',
                              captain.isActive ? 'Captain deactivated' : 'Captain activated'
                            )}
                            className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-danger-tint hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
                          >
                            {busy && updateMutation.pending ? <Loader2 size={12} className="animate-spin" /> : captain.isActive ? 'تعطيل' : 'تفعيل'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!captains.loading && rows.length === 0 && (
          <p className="py-8 text-center text-xs text-ink-muted">لا يوجد كابتن</p>
        )}
      </div>
    </PanelShell>
  );
}

/* ---------------------------------------------------------------------------
 * Shared panel shell — title, refresh, error state
 * ------------------------------------------------------------------------- */

interface PanelShellProps {
  title: string;
  en: string;
  loading: boolean;
  error: ReturnType<typeof useAdminStats>['error'];
  refreshing: boolean;
  onRefresh: () => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

function PaginationBar({
  page,
  totalPages,
  total,
  disabled,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total?: number;
  disabled?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const last = Math.max(totalPages, 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-3">
      <p className="text-[11px] font-semibold text-ink-muted">
        {total !== undefined ? `${total} نتيجة · ` : ''}
        <span dir="ltr">Page {page} / {last}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={disabled || page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:bg-canvas active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronRight size={13} />
          السابق <span dir="ltr" className="font-medium">Prev</span>
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={disabled || page >= last}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:bg-canvas active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span dir="ltr" className="font-medium">Next</span> التالي
          <ChevronLeft size={13} />
        </button>
      </div>
    </div>
  );
}

function PanelShell({ title, en, loading, error, refreshing, onRefresh, headerActions, children }: PanelShellProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-danger-tint bg-surface p-6 text-center shadow-card">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
          <AlertTriangle size={18} />
        </span>
        <p className="mt-2 text-xs font-semibold text-danger-ink">{error.message}</p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-dark"
        >
          <RefreshCw size={12} /> إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-5">
        <div>
          <h2 className="text-[15px] font-extrabold">{title}</h2>
          <p dir="ltr" className="mt-1 text-[11px] text-ink-muted">{en}</p>
        </div>
        <div className="flex items-center gap-3">
          {headerActions}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-bold text-brand hover:text-brand-dark disabled:opacity-60"
          >
            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>
      </div>
      <div className={loading ? 'opacity-60' : ''}>{children}</div>
    </article>
  );
}
