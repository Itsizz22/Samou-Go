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

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  CalendarDays,
  ImagePlus,
  Loader2,
  LogOut,
  Menu,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import {
  SignInGate,
  approveStore,
  getStoreProducts,
  removeCurrentImage,
  updateOrderStatus,
  updateProfile,
  updateStore,
  updateUser,
  useAdminStats,
  useAuth,
  useDeleteDriver,
  useDeleteStore,
  useDeleteUser,
  useMutation,
  useOrders,
  useResource,
  useRoleRedirect,
  useStores,
  useToast,
  useUploadImage,
  useUsers,
  verifyCaptain,
  type Resource,
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
  type Paginated,
  type Product,
  type PublicUser,
  type Store as StoreModel,
  type UpdateOrderStatusInput,
  type UpdateUserInput,
} from '@samou-go/shared-types';
import { AdminSidebar, ADMIN_NAV_ITEMS } from '@/components/Sidebar';
import { NotificationsDrawer, relativeTimeArabic } from '@/components/NotificationsDrawer';
import { ProfileMenu } from '@/components/ProfileMenu';
import { Badge, type BellNotification, LanguageToggle, ThemeToggle } from '@samou-go/ui';
import { LeafletMap } from '@samou-go/ui/map';
import { CreateCaptainDialog, ConfirmDialog, CreateStoreDialog } from '@/components/CreateDialogs';

/* ---------------------------------------------------------------------------
 * Shared bits
 * ------------------------------------------------------------------------- */

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

  // Unified login: non-admin roles are sent to their own workspace.
  useRoleRedirect('admin');

  const isAdmin = auth.user?.role === UserRole.ADMIN;

  // The whole KPI grid in one round-trip, polled so the dashboard stays live.
  const stats = useAdminStats({ enabled: isAdmin, pollMs: 15_000 });

  /* ---- Bell/drawer notifications derived from the stats aggregate --------- */

  const notifications: BellNotification[] = useMemo(() => {
    const list: BellNotification[] = [];
    const pending = stats.data?.stores.pendingApproval ?? 0;
    if (pending > 0) {
      list.push({
        id: 'stores-pending',
        ar: `${pending} متجر بانتظار موافقتك`,
        en: `${pending} store${pending === 1 ? '' : 's'} awaiting approval`,
        tone: 'warning',
        href: 'Stores',
      });
    }
    const unverified = (stats.data?.captains.total ?? 0) - (stats.data?.captains.verified ?? 0);
    if (unverified > 0) {
      list.push({
        id: 'captains-unverified',
        ar: `${unverified} كابتن غير موثّق`,
        en: `${unverified} unverified captain${unverified === 1 ? '' : 's'}`,
        tone: 'danger',
        href: 'Captains',
      });
    }
    for (const order of stats.data?.recentOrders ?? []) {
      list.push({
        id: `order-${order.id}`,
        ar: `طلب جديد — ${order.storeNameAr}`,
        en: order.orderNumber,
        caption: relativeTimeArabic(order.createdAt),
        tone: 'info',
        href: 'Orders',
      });
    }
    return list;
  }, [stats.data]);

  /* ---- Gates -------------------------------------------------------------- */

  if (!auth.ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
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

  /* ---- Render -------------------------------------------------------------- */

  return (
    <main
      className="min-h-screen w-full bg-canvas font-sans text-ink"
    >
      {/* Sidebar */}
      <AdminSidebar
        userName={auth.user.name}
        activeNav={activeNav}
        open={sidebarOpen}
        onNavigate={id => {
          setActiveNav(id);
          setSidebarOpen(false);
        }}
        onClose={() => setSidebarOpen(false)}
        onSignOut={auth.signOut}
      />

      {/* Main content */}
      <section className="flex min-h-screen w-full flex-col md:ps-[244px]">
        <header className="sticky top-0 z-20 flex min-h-[78px] items-center justify-between border-b border-line bg-surface/95 px-5 shadow-card backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-brand-deep hover:bg-brand-surface md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={21} />
            </button>
            <div>
              <h1 className="text-[18px] font-extrabold tracking-[-0.02em] md:text-[21px]">
                {activeNav}{' '}
                <span className="font-semibold text-ink-muted">
                  / {ADMIN_NAV_ITEMS.find(n => n.id === activeNav)?.ar}
                </span>
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
              {stats.refreshing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              <span className="hidden sm:inline">تحديث / Refresh</span>
            </button>
            <NotificationsDrawer
              notifications={notifications}
              onNavigate={target => setActiveNav(target)}
            />
            <LanguageToggle />
            <ThemeToggle />
            <span className="hidden h-8 w-px bg-line md:block" />
            <ProfileMenu name={auth.user.name} phone={auth.user.phone} onSignOut={auth.signOut} />
          </div>
        </header>

        <div className="w-full flex-1 px-5 py-7 md:px-8 md:py-9">
          {activeNav === 'Dashboard' && (
            <DashboardTab
              stats={stats.data}
              loading={stats.loading}
              error={stats.error}
              onRetry={() => void stats.reload()}
            />
          )}
          {activeNav === 'Orders' && <OrdersPanel />}
          {activeNav === 'Users' && <UsersPanel />}
          {activeNav === 'Stores' && <StoresPanel />}
          {activeNav === 'Captains' && <CaptainsPanel />}
          {activeNav === 'Settings' && <AdminSettingsPanel auth={auth} />}
        </div>
      </section>
    </main>
  );
}

function AdminSettingsPanel({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const toast = useToast();
  const [autoAssign, setAutoAssign] = useState(
    () => window.localStorage.getItem('samou-go.admin.auto-assign') !== '0'
  );
  const [baseStoreRate, setBaseStoreRate] = useState(
    () => window.localStorage.getItem('samou-go.admin.base-store-rate') ?? '0'
  );
  const [captainRate, setCaptainRate] = useState(
    () => window.localStorage.getItem('samou-go.admin.captain-rate') ?? '3'
  );
  const [name, setName] = useState(auth.user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const saveSystemSettings = () => {
    window.localStorage.setItem('samou-go.admin.auto-assign', autoAssign ? '1' : '0');
    window.localStorage.setItem('samou-go.admin.base-store-rate', baseStoreRate);
    window.localStorage.setItem('samou-go.admin.captain-rate', captainRate);
    toast.success('تم حفظ الإعدادات المحلية', 'Local dashboard settings saved');
  };

  const saveAccount = async () => {
    if (!name.trim()) return;
    if (newPassword && !currentPassword) {
      toast.error('أدخل كلمة المرور الحالية أولاً', 'Current password is required');
      return;
    }
    setSaving(true);
    try {
      const user = await updateProfile({
        name: name.trim(),
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      auth.setUser(user);
      setCurrentPassword('');
      setNewPassword('');
      toast.success('تم تحديث الحساب', 'Account updated');
    } catch (cause) {
      toast.error('تعذر تحديث الحساب', cause instanceof Error ? cause.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelShell
      title="الإعدادات"
      en="Settings"
      loading={false}
      error={null}
      refreshing={false}
      onRefresh={() => undefined}
    >
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-extrabold">إعدادات النظام</h2>
          <p dir="ltr" className="text-[11px] text-ink-muted">
            System controls
          </p>
          <label className="mt-3 flex items-center justify-between gap-3 text-sm font-bold">
            <span>التوزيع التلقائي للسائقين</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoAssign}
              onClick={() => setAutoAssign(value => !value)}
              className={`flex h-7 w-12 items-center rounded-full p-1 bg-surface transition-colors ${autoAssign ? 'justify-end bg-brand' : 'justify-start bg-line'}`}
            >
              <span className="h-5 w-5 rounded-full bg-white" />
            </button>
          </label>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-extrabold">المظهر والنسق</h2>
          <p dir="ltr" className="text-[11px] text-ink-muted">
            Appearance &amp; dark mode
          </p>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">الوضع الداكن</span>
              <ThemeToggle className="border border-line" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">اللغة / Language</span>
              <LanguageToggle className="border border-line" />
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-extrabold">الحساب والأمان</h2>
          <p dir="ltr" className="text-[11px] text-ink-muted">
            Account &amp; security
          </p>
          <div className="mt-3 space-y-2">
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="اسم العرض"
              aria-label="Display name"
              className="input-field"
            />
            <input
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              type="password"
              placeholder="كلمة المرور الحالية"
              aria-label="Current password"
              className="input-field"
            />
            <input
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              type="password"
              placeholder="كلمة المرور الجديدة"
              aria-label="New password"
              className="input-field"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAccount()}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              حفظ الحساب
            </button>
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-extrabold">رسوم التوصيل الافتراضية</h2>
          <p dir="ltr" className="text-[11px] text-ink-muted">
            Default delivery fees
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-bold">
              حصة المتجر
              <input
                dir="ltr"
                inputMode="decimal"
                value={baseStoreRate}
                onChange={event => setBaseStoreRate(event.target.value)}
                className="input-field mt-1"
              />
            </label>
            <label className="text-[11px] font-bold">
              حصة السائق
              <input
                dir="ltr"
                inputMode="decimal"
                value={captainRate}
                onChange={event => setCaptainRate(event.target.value)}
                className="input-field mt-1"
              />
            </label>
          </div>
        </section>
      </div>
      <div className="px-5 pb-5">
        <button
          type="button"
          onClick={saveSystemSettings}
          className="rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white"
        >
          حفظ إعدادات النظام والرسوم
        </button>
      </div>
    </PanelShell>
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
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');
  const pipeline = useOrders({ page: 1, pageSize: 100 }, { pollMs: 10_000 });
  const rangeStart = useMemo(() => {
    const now = new Date();
    if (range === 'today')
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (range === 'week') return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    return now.getTime() - 30 * 24 * 60 * 60 * 1000;
  }, [range]);
  const pipelineOrders = useMemo(
    () =>
      (pipeline.data?.items ?? []).filter(
        order => new Date(order.createdAt).getTime() >= rangeStart
      ),
    [pipeline.data?.items, rangeStart]
  );
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
            نظرة عامة{' '}
            <span dir="ltr" className="font-semibold text-ink-muted">
              / Overview
            </span>
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Dashboard date range">
            <CalendarDays size={15} className="text-brand" />
            {(
              [
                ['today', 'Today'],
                ['week', 'This week'],
                ['month', 'This month'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                  range === value
                    ? 'bg-brand text-white'
                    : 'bg-brand-tint text-brand-deep hover:bg-brand-surface'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="text-micro text-ink-muted">
              Pipeline data refreshes every 10 seconds.
            </span>
          </div>
        </div>
        <section
          className="mb-8 overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
          aria-label="خريطة التشغيل / Operations map"
        >
          <div className="flex items-center justify-between border-b border-line-soft px-5 py-3">
            <div>
              <p className="text-xs font-extrabold text-ink">منطقة التشغيل — السموع</p>
              <p dir="ltr" className="mt-0.5 text-micro text-ink-muted">
                Operations map · Samou', Hebron
              </p>
            </div>
          </div>
          <div className="h-80">
            <LeafletMap
              center={[31.3971, 35.0716]}
              zoom={13}
              className="h-full w-full z-0"
              markers={[{ position: [31.3971, 35.0716], label: "Samou' Go — منطقة التشغيل" }]}
            />
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(kpi => {
            const Icon = kpi.icon;
            return (
              <article
                key={kpi.label}
                className="rounded-xl border border-line bg-surface p-5 shadow-card"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand">
                    <Icon size={20} />
                  </span>
                </div>
                <p
                  dir="ltr"
                  className="mt-5 text-[26px] font-extrabold leading-none tracking-[-0.04em] text-ink"
                >
                  {loading && !stats ? (
                    <span
                      className="inline-block h-8 w-16 animate-pulse rounded bg-line-soft"
                      aria-hidden="true"
                    />
                  ) : (
                    kpi.display
                  )}
                </p>
                <p className="mt-2 text-xs font-semibold text-ink-soft">{kpi.label}</p>
                <p dir="rtl" className="mt-0.5 text-[11px] text-ink-muted">
                  {kpi.ar}
                </p>
              </article>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 grid-cols-2 xl:grid-cols-4">
          <StatusKpi
            label="بانتظار الموافقة"
            en="Pending"
            count={stats?.orders.byStatus[OrderStatus.PENDING] ?? 0}
            tone="warning"
          />
          <StatusKpi
            label="جاهز للاستلام"
            en="Ready"
            count={stats?.orders.byStatus[OrderStatus.READY_FOR_PICKUP] ?? 0}
            tone="info"
          />
          <StatusKpi
            label="متاجر بانتظار الموافقة"
            en="Stores awaiting approval"
            count={stats?.stores.pendingApproval ?? 0}
            tone="warning"
          />
          <StatusKpi
            label="المتاجر النشطة"
            en="Active stores"
            count={stats?.stores.active ?? 0}
            tone="brand"
          />
          <StatusKpi
            label="إجمالي المستخدمين"
            en="Registered users"
            count={stats?.users.total ?? 0}
            tone="brand"
          />
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
        <section className="mt-7 overflow-x-auto" aria-labelledby="pipeline-title">
          <div className="min-w-[760px] rounded-xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="pipeline-title" className="text-[15px] font-extrabold">
                  لوحة سير الطلبات
                </h2>
                <p dir="ltr" className="mt-1 text-[11px] text-ink-muted">
                  Live order pipeline · {pipelineOrders.length} orders in selected range
                </p>
              </div>
              {pipeline.refreshing && (
                <Loader2
                  size={16}
                  className="animate-spin text-brand"
                  aria-label="Refreshing pipeline"
                />
              )}
            </div>
            <div className="mt-4 grid grid-cols-4 gap-3">
              {(
                [
                  OrderStatus.PENDING,
                  OrderStatus.PREPARING,
                  OrderStatus.ON_THE_WAY,
                  OrderStatus.DELIVERED,
                ] as const
              ).map(status => {
                const column = pipelineOrders.filter(order => order.status === status);
                return (
                  <div key={status} className="min-h-32 rounded-xl bg-canvas p-3">
                    <div className="flex items-center justify-between">
                      <Badge tone={ORDER_STATUS_TONES[status]}>
                        {ORDER_STATUS_LABELS[status].ar}
                      </Badge>
                      <span className="text-[11px] font-extrabold text-ink-muted">
                        {column.length}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {column.slice(0, 5).map(order => (
                        <li
                          key={order.id}
                          className="rounded-lg border border-line bg-surface p-2 text-micro shadow-card"
                        >
                          <p className="font-extrabold text-brand-deep" dir="ltr">
                            {order.orderNumber}
                          </p>
                          <p className="mt-1 truncate text-ink-muted">{order.storeNameAr}</p>
                          <p className="mt-1 font-bold text-ink" dir="ltr">
                            {formatILS(order.totalAmount)}
                          </p>
                        </li>
                      ))}
                      {column.length === 0 && (
                        <li className="pt-4 text-center text-micro text-ink-muted">No orders</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {!error && (
        <section
          className="mt-7 grid gap-5 xl:grid-cols-[1.55fr_1fr]"
          aria-label="Recent orders and activity"
        >
          <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-5">
              <div>
                <h2 className="text-[15px] font-extrabold">أحدث الطلبات</h2>
                <p dir="ltr" className="mt-1 text-[11px] text-ink-muted">
                  Recent Orders
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-start">
                <thead className="bg-canvas text-micro font-bold uppercase tracking-[0.06em] text-ink-muted">
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
                    ? [0, 1, 2, 3, 4].map(i => (
                        <tr key={i} aria-hidden="true">
                          {[0, 1, 2, 3, 4, 5].map(j => (
                            <td key={j} className="px-5 py-4">
                              <div className="h-3 animate-pulse rounded bg-line-soft" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : recent.map(order => (
                        <tr key={order.id} className="text-xs hover:bg-canvas">
                          <td className="px-5 py-4 font-bold text-brand-deep" dir="ltr">
                            {order.orderNumber}
                          </td>
                          <td className="px-3 py-4 text-ink-muted">{order.storeNameAr}</td>
                          <td className="px-3 py-4 text-ink-muted">{order.itemCount}</td>
                          <td className="px-3 py-4">
                            <Badge tone={ORDER_STATUS_TONES[order.status]}>
                              {ORDER_STATUS_LABELS[order.status].ar}
                            </Badge>
                          </td>
                          <td className="px-3 py-4 text-ink-muted" dir="ltr">
                            {shortTime(order.createdAt)}
                          </td>
                          <td
                            className="px-5 py-4 text-end font-extrabold text-brand-deep"
                            dir="ltr"
                          >
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
              <p dir="ltr" className="mt-1 text-[11px] text-ink-muted">
                Orders by status
              </p>
            </div>
            <ul className="mt-5 space-y-3">
              {Object.values(OrderStatus).map(status => {
                const count = stats?.orders.byStatus[status] ?? 0;
                const total = stats?.orders.total ?? 1;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <li key={status}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-ink-soft">
                        {ORDER_STATUS_LABELS[status].ar}
                        <span dir="ltr" className="ms-1 font-medium text-ink-muted">
                          · {ORDER_STATUS_LABELS[status].en}
                        </span>
                      </span>
                      <span className="font-extrabold text-ink" dir="ltr">
                        {count} ({pct}%)
                      </span>
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

function StatusKpi({
  label,
  en,
  count,
  tone,
}: {
  label: string;
  en: string;
  count: number;
  tone: 'brand' | 'warning' | 'info' | 'danger';
}) {
  const tint: Record<string, string> = {
    brand: 'bg-brand-tint text-brand-deep',
    warning: 'bg-warning-tint text-warning-ink',
    info: 'bg-info-tint text-info-ink',
    danger: 'bg-danger-tint text-danger-ink',
  };
  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="text-[20px] font-extrabold text-ink" dir="ltr">
        {count}
      </p>
      <p className="mt-1 text-xs font-bold text-ink-soft">{label}</p>
      <p dir="ltr" className="mt-0.5 text-micro text-ink-muted">
        {en}
      </p>
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'amount'>('newest');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [statusFilter]);
  const orders = useOrders(
    { page, pageSize: 50, ...(statusFilter === 'ALL' ? {} : { status: statusFilter }) },
    { pollMs: 10_000 }
  );
  const rows = useMemo(() => {
    const filtered = (orders.data?.items ?? []).filter(
      order =>
        !debouncedSearch ||
        order.orderNumber.toLowerCase().includes(debouncedSearch) ||
        order.storeNameAr.toLowerCase().includes(debouncedSearch)
    );
    return [...filtered].sort((left, right) =>
      sortBy === 'amount'
        ? right.totalAmount - left.totalAmount
        : new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  }, [debouncedSearch, orders.data?.items, sortBy]);

  const pendingIdRef = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const transition = useMutation<UpdateOrderStatusInput, OrderDetail>((input, signal) =>
    updateOrderStatus(pendingIdRef.current as string, input, signal)
  );

  const overrideStatus = async (orderId: string, status: OrderStatus) => {
    pendingIdRef.current = orderId;
    setPendingId(orderId);
    const result = await transition.run({ status });
    pendingIdRef.current = null;
    setPendingId(null);
    if (result) {
      toast.success(
        `تم تغيير حالة ${result.orderNumber}`,
        `Order ${result.orderNumber} moved to ${ORDER_STATUS_LABELS[status].en}`
      );
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
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-ink-muted sm:w-[220px]">
            <Search size={15} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="w-full bg-transparent text-xs outline-none placeholder:text-ink-subtle"
              placeholder="Order or store…"
              aria-label="Search orders"
            />
          </label>
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as 'ALL' | OrderStatus)}
            className="h-9 rounded-xl border border-line bg-canvas px-2 text-xs font-semibold text-ink outline-none focus:border-brand"
            aria-label="Filter order status"
          >
            <option value="ALL">All statuses</option>
            {Object.values(OrderStatus).map(status => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status].en}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortBy(value => (value === 'newest' ? 'amount' : 'newest'))}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-line bg-canvas px-3 text-xs font-bold text-ink-soft hover:border-brand"
          >
            <ArrowUpDown size={14} /> {sortBy === 'newest' ? 'Newest' : 'Amount'}
          </button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-start">
          <thead className="bg-canvas text-micro font-bold uppercase tracking-[0.06em] text-ink-muted">
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
              ? [0, 1, 2, 3, 4].map(i => (
                  <tr key={i} aria-hidden="true">
                    {[0, 1, 2, 3, 4].map(j => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3 animate-pulse rounded bg-line-soft" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map(order => {
                  const next = ORDER_STATUS_TRANSITIONS[order.status];
                  const legal = next.filter(status => ORDER_STATUS_TONES[status]);
                  const busy = pendingId === order.id && transition.pending;
                  return (
                    <tr key={order.id} className="text-xs hover:bg-canvas">
                      <td className="px-5 py-3 font-bold text-brand-deep" dir="ltr">
                        {order.orderNumber}
                      </td>
                      <td className="px-3 py-3 text-ink-muted">{order.storeNameAr}</td>
                      <td className="px-3 py-3">
                        <Badge tone={ORDER_STATUS_TONES[order.status]}>
                          {ORDER_STATUS_LABELS[order.status].ar}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        {legal.length === 0 ? (
                          <span className="text-micro text-ink-muted">—</span>
                        ) : (
                          <select
                            value=""
                            disabled={busy}
                            onChange={e => {
                              const value = e.target.value as OrderStatus;
                              if (value) void overrideStatus(order.id, value);
                            }}
                            className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-[11px] font-semibold text-ink outline-none focus:border-brand disabled:opacity-60"
                            aria-label={`Override status for ${order.orderNumber}`}
                          >
                            <option value="" disabled>
                              {busy ? '…' : 'تحويل إلى / Move to…'}
                            </option>
                            {legal.map(status => (
                              <option key={status} value={status}>
                                {ORDER_STATUS_LABELS[status].ar} / {ORDER_STATUS_LABELS[status].en}
                              </option>
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
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => Math.min(orders.data?.totalPages ?? p, p + 1))}
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
  const stores = useStores({ activeOnly: false, page: 1, pageSize: 100 });

  const pendingIdRef = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const updateMutation = useMutation<UpdateUserInput, PublicUser>((input, signal) =>
    updateUser(pendingIdRef.current as string, input, signal)
  );

  /* ---- Bulk selection (activate / deactivate) ------------------------------ */
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectVisible = (checked: boolean) => {
    const selectable = rows.filter(user => user.role !== UserRole.ADMIN).map(user => user.id);
    setSelectedIds(checked ? new Set(selectable) : new Set());
  };

  const allVisibleSelected =
    rows.length > 0 && rows.every(user => user.role === UserRole.ADMIN || selectedIds.has(user.id));

  const runBulkActive = async (active: boolean) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map(id => updateUser(id, { isActive: active })));
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    setSelectedIds(new Set());
    if (failed > 0) {
      toast.error(`${ok} تمت معالجتها، تعذّر ${failed}`, `${ok} updated, ${failed} failed`, {
        duration: 5_000,
      });
    } else {
      toast.success(
        active ? 'تم تفعيل الحسابات المحددة' : 'تم تعطيل الحسابات المحددة',
        `${ok} account(s) ${active ? 'activated' : 'deactivated'}`
      );
    }
    void users.reload();
    setBulkBusy(false);
  };

  const runUpdate = async (
    id: string,
    input: UpdateUserInput,
    successAr: string,
    successEn: string
  ) => {
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

  /* ---- Deletion (soft: deactivates the account + kills its sessions) ------ */
  const [deleteTarget, setDeleteTarget] = useState<PublicUser | null>(null);
  const deleteMutation = useDeleteUser();

  const runDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteMutation.run(deleteTarget.id);
    if (result) {
      toast.success(
        `تم حذف حساب «${deleteTarget.name}»`,
        `Account "${deleteTarget.name}" removed`
      );
      setDeleteTarget(null);
      void users.reload();
    } else {
      toast.error('تعذّر حذف الحساب', deleteMutation.error?.message ?? 'Delete failed', {
        duration: 5_000,
      });
    }
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
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs outline-none placeholder:text-ink-subtle"
              placeholder="ابحث بالاسم أو الجوال / Search name or phone…"
              aria-label="Search users"
            />
          </label>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as 'ALL' | UserRole)}
            className="h-9 rounded-xl border border-line bg-canvas px-2 text-xs font-semibold text-ink outline-none focus:border-brand"
            aria-label="Filter by role"
          >
            <option value="ALL">كل الأدوار / All roles</option>
            {(Object.keys(UserRole) as UserRole[]).map(role => (
              <option key={role} value={role}>
                {USER_ROLE_LABELS[role].ar} / {USER_ROLE_LABELS[role].en}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-brand-surface/60 px-5 py-2.5">
          <span className="text-[11px] font-bold text-brand-deep">
            {selectedIds.size} محدد{' '}
            <span dir="ltr" className="font-medium">
              / selected
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void runBulkActive(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : null}
              تفعيل{' '}
              <span dir="ltr" className="font-medium">
                Activate
              </span>
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void runBulkActive(false)}
              className="flex items-center gap-1.5 rounded-lg border border-danger-tint bg-danger-tint px-2.5 py-1.5 text-[11px] font-bold text-danger-ink transition hover:bg-danger-ink hover:text-white disabled:opacity-60"
            >
              {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : null}
              تعطيل{' '}
              <span dir="ltr" className="font-medium">
                Deactivate
              </span>
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:bg-canvas disabled:opacity-60"
            >
              إلغاء{' '}
              <span dir="ltr" className="font-medium">
                Clear
              </span>
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-start">
          <thead className="bg-canvas text-micro font-bold uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={e => selectVisible(e.target.checked)}
                  className="h-3.5 w-3.5 accent-brand"
                  aria-label="Select all users on this page"
                />
              </th>
              <th className="px-5 py-3">User</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Captain store</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {users.loading && rows.length === 0
              ? [0, 1, 2, 3, 4, 5, 6].map(i => (
                  <tr key={i} aria-hidden="true">
                    {[0, 1, 2, 3, 4, 5, 6].map(j => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3 animate-pulse rounded bg-line-soft" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map(user => {
                  const busy = pendingId === user.id && updateMutation.pending;
                  return (
                    <tr key={user.id} className="text-xs hover:bg-canvas">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          disabled={user.role === UserRole.ADMIN || bulkBusy}
                          checked={selectedIds.has(user.id)}
                          onChange={() => toggleSelect(user.id)}
                          className="h-3.5 w-3.5 accent-brand disabled:opacity-40"
                          aria-label={`Select ${user.name}`}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-micro font-extrabold text-brand-deep">
                            {user.name.slice(0, 2)}
                          </span>
                          <span className="font-bold text-ink">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-muted" dir="ltr">
                        {user.phone}
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={user.role}
                          disabled={busy || user.role === UserRole.ADMIN}
                          onChange={e => changeRole(user, e.target.value as UserRole)}
                          className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-[11px] font-semibold text-ink outline-none focus:border-brand disabled:opacity-60"
                          aria-label={`Role for ${user.name}`}
                        >
                          {(Object.keys(UserRole) as UserRole[]).map(role => (
                            <option key={role} value={role}>
                              {USER_ROLE_LABELS[role].ar}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        {user.role === UserRole.CAPTAIN ? (
                          <select
                            value={user.assignedStoreId ?? ''}
                            disabled={busy || stores.loading}
                            onChange={e =>
                              void runUpdate(
                                user.id,
                                { assignedStoreId: e.target.value || null },
                                e.target.value
                                  ? 'تم تخصيص الكابتن للمتجر'
                                  : 'تم إلغاء تخصيص الكابتن',
                                e.target.value
                                  ? 'Captain assigned to store'
                                  : 'Captain returned to shared pool'
                              )
                            }
                            className="max-w-44 rounded-lg border border-line bg-canvas px-2 py-1.5 text-[11px] font-semibold text-ink outline-none focus:border-brand disabled:opacity-60"
                            aria-label={`Dedicated store for ${user.name}`}
                          >
                            <option value="">المجموعة المشتركة / Shared pool</option>
                            {(stores.data?.items ?? []).map(store => (
                              <option key={store.id} value={store.id}>
                                {store.nameAr}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-micro font-bold ${
                            user.isActive
                              ? 'bg-brand-tint text-brand-deep'
                              : 'bg-danger-tint text-danger-ink'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${user.isActive ? 'bg-brand' : 'bg-danger'}`}
                          />
                          {user.isActive ? 'نشط' : 'موقوف'}
                          {user.role === UserRole.CAPTAIN &&
                            (user.isVerified ? ' · موثّق' : ' · غير موثّق')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-end">
                        <button
                          type="button"
                          disabled={busy || user.role === UserRole.ADMIN}
                          onClick={() => toggleActive(user)}
                          className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-danger-tint hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : user.isActive ? (
                            'تعطيل'
                          ) : (
                            'تفعيل'
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={busy || user.role === UserRole.ADMIN}
                          onClick={() => setDeleteTarget(user)}
                          className="ms-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-danger hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
                          aria-label={`Delete account ${user.name}`}
                        >
                          <Trash2 size={12} />
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
      <ConfirmDialog
        open={deleteTarget !== null}
        title="حذف الحساب"
        en="Delete account"
        message={
          deleteTarget
            ? `سيتم إيقاف حساب «${deleteTarget.name}» (${deleteTarget.phone}) نهائياً وإلغاء جميع جلساته.`
            : ''
        }
        confirmLabelAr="حذف"
        confirmLabelEn="Delete"
        pending={deleteMutation.pending}
        onConfirm={() => void runDelete()}
        onClose={() => setDeleteTarget(null)}
      />
      {users.data && users.data.totalPages > 1 && (
        <PaginationBar
          page={users.data.page}
          totalPages={users.data.totalPages}
          total={users.data.total}
          disabled={users.loading}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => Math.min(users.data?.totalPages ?? p, p + 1))}
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
  const captains = useUsers({ role: UserRole.CAPTAIN, pageSize: 100 });
  const rows = stores.data?.items ?? [];
  const [createOpen, setCreateOpen] = useState(false);

  const pendingIdRef = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const approveMutation = useMutation<null, StoreModel>((_, signal) =>
    approveStore(pendingIdRef.current as string, signal)
  );
  const toggleMutation = useMutation<{ isActive: boolean }, StoreModel>((input, signal) =>
    updateStore(pendingIdRef.current as string, input, signal)
  );
  const captainIdRef = useRef<string | null>(null);
  const assignCaptainMutation = useMutation<UpdateUserInput, PublicUser>((input, signal) =>
    updateUser(captainIdRef.current as string, input, signal)
  );

  const assignCaptain = async (captainId: string, storeId: string) => {
    captainIdRef.current = captainId;
    const result = await assignCaptainMutation.run({ assignedStoreId: storeId });
    captainIdRef.current = null;
    if (result) {
      toast.success('تم إسناد السائق المخصص', 'Dedicated captain assigned');
      void captains.reload();
    } else {
      toast.error('تعذر إسناد السائق', assignCaptainMutation.error?.message ?? 'Assignment failed');
    }
  };

  /* ---- Image management: store logos + per-store product images -------------- */

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const productImages = useResource(
    `admin-store-products:${expandedId ?? ''}`,
    signal => getStoreProducts(expandedId as string, { page: 1, pageSize: 200 }, signal),
    { enabled: expandedId !== null }
  );

  const upload = useUploadImage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTargetRef = useRef<{ kind: 'store' | 'product'; id: string } | null>(null);
  const [imageBusyKey, setImageBusyKey] = useState<string | null>(null);

  const openPicker = (kind: 'store' | 'product', id: string) => {
    pendingTargetRef.current = { kind, id };
    fileInputRef.current?.click();
  };

  const handleImagePicked = async (file: File | undefined) => {
    const target = pendingTargetRef.current;
    pendingTargetRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || !target) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('الملف أكبر من 8MB', 'File exceeds 8MB');
      return;
    }
    setImageBusyKey(`${target.kind}:${target.id}`);
    try {
      const result = await upload.run({ kind: target.kind, resourceId: target.id, file });
      if (!result) {
        toast.error(upload.error?.message ?? 'تعذّر رفع الصورة', 'Upload failed');
        return;
      }
      toast.success(
        target.kind === 'store' ? 'تم تحديث شعار المتجر' : 'تم تحديث صورة المنتج',
        target.kind === 'store' ? 'Store logo updated' : 'Product image updated'
      );
      void stores.reload();
      if (target.kind === 'product') void productImages.reload();
    } finally {
      setImageBusyKey(null);
    }
  };

  const handleRemoveImage = async (kind: 'store' | 'product', id: string) => {
    setImageBusyKey(`${kind}:${id}`);
    try {
      await removeCurrentImage(kind, id);
      toast.info(
        kind === 'store' ? 'تمت إزالة الشعار' : 'تمت إزالة الصورة',
        kind === 'store' ? 'Store logo removed' : 'Product image removed'
      );
      void stores.reload();
      if (kind === 'product') void productImages.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر إزالة الصورة', message);
    } finally {
      setImageBusyKey(null);
    }
  };

  const runAction = async (
    id: string,
    action: () => Promise<StoreModel | null>,
    successAr: string,
    successEn: string
  ) => {
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

  /* ---- Deletion (soft: closes the shopfront + deactivates the owner) ------- */
  const [deleteTarget, setDeleteTarget] = useState<StoreModel | null>(null);
  const deleteMutation = useDeleteStore();

  const runDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteMutation.run(deleteTarget.id);
    if (result) {
      toast.success(
        `تم حذف المتجر «${deleteTarget.nameAr}»`,
        `Store "${deleteTarget.nameEn}" removed`
      );
      setDeleteTarget(null);
      void stores.reload();
      void captains.reload();
    } else {
      toast.error('تعذّر حذف المتجر', deleteMutation.error?.message ?? 'Delete failed', {
        duration: 5_000,
      });
    }
  };

  /* ---- Bulk selection (approve / open / close) ------------------------------ */
  const [selectedStores, setSelectedStores] = useState<ReadonlySet<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleStoreSelect = (id: string) => {
    setSelectedStores(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allStoresSelected = rows.length > 0 && rows.every(store => selectedStores.has(store.id));

  const runBulkStore = async (action: 'approve' | 'open' | 'close') => {
    const ids = [...selectedStores];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const jobs = ids.map(id =>
      action === 'approve' ? approveStore(id) : updateStore(id, { isActive: action === 'open' })
    );
    const results = await Promise.allSettled(jobs);
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    setSelectedStores(new Set());
    if (failed > 0) {
      toast.error(`${ok} تمت معالجتها، تعذّر ${failed}`, `${ok} completed, ${failed} failed`, {
        duration: 5_000,
      });
    } else {
      const labels = {
        approve: ['تمت الموافقة على المتاجر المحددة', `${ok} store(s) approved`],
        open: ['تم فتح المتاجر المحددة', `${ok} store(s) opened`],
        close: ['تم إغلاق المتاجر المحددة', `${ok} store(s) closed`],
      } as const;
      toast.success(labels[action][0], labels[action][1]);
    }
    void stores.reload();
    setBulkBusy(false);
  };

  return (
    <PanelShell
      title="المتاجر"
      en="Registered Stores"
      loading={stores.loading}
      error={stores.error}
      refreshing={stores.refreshing}
      onRefresh={() => void stores.reload()}
      headerActions={
        <>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white shadow-brand transition hover:bg-brand-dark active:scale-[0.98]"
          >
            <Plus size={14} /> <span>إضافة متجر</span>
            <span dir="ltr" className="font-medium text-white/85">
              Add store
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose an image"
            onChange={e => void handleImagePicked(e.target.files?.[0])}
          />
        </>
      }
    >
      <CreateStoreDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void stores.reload()}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="حذف المتجر"
        en="Delete store"
        message={
          deleteTarget
            ? `سيتم إغلاق متجر «${deleteTarget.nameAr}» نهائياً وإيقاف حساب مديره، وسيختفي من التطبيق فوراً.`
            : ''
        }
        confirmLabelAr="حذف"
        confirmLabelEn="Delete"
        pending={deleteMutation.pending}
        onConfirm={() => void runDelete()}
        onClose={() => setDeleteTarget(null)}
      />
      {selectedStores.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-brand-surface/60 px-5 py-2.5">
          <span className="text-[11px] font-bold text-brand-deep">
            {selectedStores.size} محدد{' '}
            <span dir="ltr" className="font-medium">
              / selected
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void runBulkStore('approve')}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : null}
              موافقة{' '}
              <span dir="ltr" className="font-medium">
                Approve
              </span>
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void runBulkStore('open')}
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-brand hover:bg-brand-surface hover:text-brand-deep disabled:opacity-60"
            >
              {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : null}
              فتح{' '}
              <span dir="ltr" className="font-medium">
                Open
              </span>
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void runBulkStore('close')}
              className="flex items-center gap-1.5 rounded-lg border border-danger-tint bg-danger-tint px-2.5 py-1.5 text-[11px] font-bold text-danger-ink transition hover:bg-danger-ink hover:text-white disabled:opacity-60"
            >
              {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : null}
              إغلاق{' '}
              <span dir="ltr" className="font-medium">
                Close
              </span>
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setSelectedStores(new Set())}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:bg-canvas disabled:opacity-60"
            >
              إلغاء{' '}
              <span dir="ltr" className="font-medium">
                Clear
              </span>
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-start">
          <thead className="bg-canvas text-micro font-bold uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allStoresSelected}
                  onChange={e =>
                    setSelectedStores(
                      e.target.checked ? new Set(rows.map(row => row.id)) : new Set()
                    )
                  }
                  className="h-3.5 w-3.5 accent-brand"
                  aria-label="Select all stores on this page"
                />
              </th>
              <th className="px-5 py-3">Store</th>
              <th className="px-3 py-3">Approval</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {stores.loading && rows.length === 0
              ? [0, 1, 2, 3, 4].map(i => (
                  <tr key={i} aria-hidden="true">
                    {[0, 1, 2, 3, 4].map(j => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3 animate-pulse rounded bg-line-soft" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map(store => {
                  const busy = pendingId === store.id;
                  const logoBusy = imageBusyKey === `store:${store.id}`;
                  const expanded = expandedId === store.id;
                  return (
                    <Fragment key={store.id}>
                      <tr className="text-xs hover:bg-canvas">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            disabled={bulkBusy}
                            checked={selectedStores.has(store.id)}
                            onChange={() => toggleStoreSelect(store.id)}
                            className="h-3.5 w-3.5 accent-brand disabled:opacity-40"
                            aria-label={`Select ${store.nameAr}`}
                          />
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-tint text-micro font-extrabold text-brand-deep">
                              {store.logoUrl ? (
                                <img
                                  src={store.logoUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                store.nameAr.slice(0, 2)
                              )}
                            </span>
                            <span>
                              <strong className="block font-bold text-ink">{store.nameAr}</strong>
                              <span className="block text-micro text-ink-muted" dir="ltr">
                                {store.nameEn}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {store.isApproved ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-micro font-bold text-brand-deep">
                              <BadgeCheck size={12} /> موافق عليه
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-warning-tint px-2.5 py-1 text-micro font-bold text-warning-ink">
                              بانتظار الموافقة
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-micro font-bold ${
                              store.isActive
                                ? 'bg-brand-tint text-brand-deep'
                                : 'bg-canvas text-ink-muted'
                            }`}
                          >
                            {store.isActive ? 'مفتوح' : 'مغلق'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {!store.isApproved && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void runAction(
                                    store.id,
                                    () => approveMutation.run(null),
                                    'تمت الموافقة على المتجر',
                                    'Store approved'
                                  )
                                }
                                className="rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
                              >
                                {busy && approveMutation.pending ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  'موافقة'
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void runAction(
                                  store.id,
                                  () => toggleMutation.run({ isActive: !store.isActive }),
                                  store.isActive ? 'تم إغلاق المتجر' : 'تم فتح المتجر',
                                  store.isActive ? 'Store closed' : 'Store opened'
                                )
                              }
                              className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-brand hover:bg-brand-surface hover:text-brand-deep disabled:opacity-50"
                            >
                              {busy && toggleMutation.pending ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : store.isActive ? (
                                'إغلاق'
                              ) : (
                                'فتح'
                              )}
                            </button>
                            <label className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-bold text-ink-soft">
                              <span className="hidden sm:inline">إسناد سائق</span>
                              <select
                                defaultValue=""
                                disabled={busy || assignCaptainMutation.pending}
                                onChange={event => {
                                  if (event.target.value)
                                    void assignCaptain(event.target.value, store.id);
                                  event.currentTarget.value = '';
                                }}
                                className="max-w-28 bg-transparent text-[11px] outline-none"
                                aria-label={`Assign dedicated captain to ${store.nameAr}`}
                              >
                                <option value="">Assign Captain</option>
                                {(captains.data?.items ?? [])
                                  .filter(
                                    captain =>
                                      !captain.assignedStoreId ||
                                      captain.assignedStoreId === store.id
                                  )
                                  .map(captain => (
                                    <option key={captain.id} value={captain.id}>
                                      {captain.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            {store.logoUrl ? (
                              <>
                                <button
                                  type="button"
                                  disabled={logoBusy || busy}
                                  onClick={() => openPicker('store', store.id)}
                                  className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-brand-deep transition hover:bg-brand-surface disabled:opacity-50"
                                >
                                  {logoBusy ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <ImagePlus size={12} />
                                  )}
                                  <span>الشعار</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={logoBusy || busy}
                                  onClick={() => void handleRemoveImage('store', store.id)}
                                  className="flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-danger-tint hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
                                  aria-label={`Remove ${store.nameAr} logo`}
                                >
                                  <X size={12} />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={logoBusy || busy}
                                onClick={() => openPicker('store', store.id)}
                                className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-brand hover:bg-brand-surface hover:text-brand-deep disabled:opacity-50"
                              >
                                {logoBusy ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <ImagePlus size={12} />
                                )}
                                <span>شعار</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : store.id)}
                              className="flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-[11px] font-bold text-ink-soft transition hover:bg-canvas"
                              aria-expanded={expanded}
                              aria-label={`${expanded ? 'Hide' : 'Show'} products for ${store.nameAr}`}
                            >
                              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              <span className="hidden sm:inline">منتجات</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setDeleteTarget(store)}
                              className="flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-danger hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
                              aria-label={`Delete store ${store.nameAr}`}
                            >
                              <Trash2 size={12} />
                              <span className="hidden sm:inline">حذف</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td
                            colSpan={5}
                            className="border-t border-line-soft bg-canvas/50 px-5 py-4"
                          >
                            <StoreProductImagesManager
                              storeId={store.id}
                              busyKey={imageBusyKey}
                              resource={productImages}
                              onPick={openPicker}
                              onRemove={handleRemoveImage}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => Math.min(stores.data?.totalPages ?? p, p + 1))}
        />
      )}
    </PanelShell>
  );
}

/** The product-image strip inside an expanded store row (admin only). */
function StoreProductImagesManager({
  storeId,
  busyKey,
  resource,
  onPick,
  onRemove,
}: {
  storeId: string;
  busyKey: string | null;
  resource: Resource<Paginated<Product>>;
  onPick: (kind: 'product', id: string) => void;
  onRemove: (kind: 'product', id: string) => void;
}) {
  const products = resource.data?.items ?? [];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-ink">صور المنتجات</p>
          <p dir="ltr" className="mt-0.5 text-micro text-ink-muted">
            Product images for store <span className="font-bold">{storeId}</span> —{' '}
            {products.length}
          </p>
        </div>
        {resource.loading && products.length === 0 && (
          <Loader2 size={14} className="animate-spin text-brand" aria-label="Loading products" />
        )}
        {resource.error && (
          <span className="text-micro font-semibold text-danger-ink">
            {resource.error.message}
          </span>
        )}
      </div>
      {products.length === 0 && !resource.loading && !resource.error ? (
        <p className="py-4 text-center text-[11px] text-ink-muted">لا توجد منتجات في هذا المتجر</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map(product => {
            const busy = busyKey === `product:${product.id}`;
            return (
              <div
                key={product.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
              >
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.nameAr}
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                    <Package size={18} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-[11px] text-ink">{product.nameAr}</strong>
                  <span className="block text-micro text-ink-muted" dir="ltr">
                    {product.id}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPick('product', product.id)}
                  className="flex h-7 items-center gap-1 rounded-lg bg-brand px-2 text-micro font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
                  aria-label={`Change image for ${product.nameAr}`}
                >
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <ImagePlus size={11} />}
                  <span>{product.imageUrl ? 'تغيير' : 'إضافة'}</span>
                </button>
                {product.imageUrl && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onRemove('product', product.id)}
                    className="flex h-7 items-center rounded-lg border border-line px-2 text-micro font-bold text-ink-muted transition hover:border-danger-tint hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
                    aria-label={`Remove image for ${product.nameAr}`}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Captains panel — verify accounts, freeze, watch availability
 * ------------------------------------------------------------------------- */

function CaptainsPanel() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const captains = useUsers({ role: UserRole.CAPTAIN, pageSize: 50 });
  const stores = useStores({ activeOnly: false, page: 1, pageSize: 100 });
  const storeNames = useMemo(
    () => new Map((stores.data?.items ?? []).map(store => [store.id, store.nameAr])),
    [stores.data?.items]
  );
  const rows = useMemo(
    () =>
      (captains.data?.items ?? []).filter(captain => {
        const matchingSearch =
          !search.trim() ||
          captain.name.toLowerCase().includes(search.trim().toLowerCase()) ||
          captain.phone.includes(search.trim());
        const online = captain.isActive && captain.isAvailable;
        return (
          matchingSearch &&
          (availability === 'ALL' || (availability === 'ONLINE' ? online : !online))
        );
      }),
    [availability, captains.data?.items, search]
  );

  const pendingIdRef = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const verifyMutation = useMutation<null, PublicUser>((_, signal) =>
    verifyCaptain(pendingIdRef.current as string, signal)
  );
  const updateMutation = useMutation<UpdateUserInput, PublicUser>((input, signal) =>
    updateUser(pendingIdRef.current as string, input, signal)
  );

  const runAction = async (
    id: string,
    action: () => Promise<PublicUser | null>,
    successAr: string,
    successEn: string
  ) => {
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

  /* ---- Deletion (removes the driver + their profile data) ------------------ */
  const [deleteTarget, setDeleteTarget] = useState<PublicUser | null>(null);
  const deleteMutation = useDeleteDriver();

  const runDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteMutation.run(deleteTarget.id);
    if (result) {
      toast.success(
        `تم حذف السائق «${deleteTarget.name}»`,
        `Driver "${deleteTarget.name}" removed`
      );
      setDeleteTarget(null);
      void captains.reload();
      void stores.reload();
    } else {
      toast.error('تعذّر حذف السائق', deleteMutation.error?.message ?? 'Delete failed', {
        duration: 5_000,
      });
    }
  };

  const onlineCount = rows.filter(c => c.isActive && c.isAvailable).length;

  return (
    <PanelShell
      title={`كابتن التوصيل (${rows.length})`}
      en={`Delivery Captains — ${onlineCount} online`}
      loading={captains.loading}
      error={captains.error}
      refreshing={captains.refreshing}
      onRefresh={() => void captains.reload()}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white shadow-brand transition hover:bg-brand-dark active:scale-[0.98]"
          >
            <Plus size={14} /> <span>إضافة سائق</span>
            <span dir="ltr" className="font-medium text-white/85">
              Add driver
            </span>
          </button>
          <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-ink-muted sm:w-[200px]">
            <Search size={15} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="w-full bg-transparent text-xs outline-none placeholder:text-ink-subtle"
              placeholder="Captain name or phone…"
              aria-label="Search captains"
            />
          </label>
          <select
            value={availability}
            onChange={event => setAvailability(event.target.value as 'ALL' | 'ONLINE' | 'OFFLINE')}
            className="h-9 rounded-xl border border-line bg-canvas px-2 text-xs font-semibold text-ink outline-none focus:border-brand"
            aria-label="Filter captain availability"
          >
            <option value="ALL">All availability</option>
            <option value="ONLINE">Online</option>
            <option value="OFFLINE">Offline</option>
          </select>
        </div>
      }
    >
      <CreateCaptainDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void captains.reload()}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-start">
          <thead className="bg-canvas text-micro font-bold uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-5 py-3">Captain</th>
              <th className="px-3 py-3">Verification</th>
              <th className="px-3 py-3">Availability</th>
              <th className="px-3 py-3">Dedicated store</th>
              <th className="px-5 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {captains.loading && rows.length === 0
              ? [0, 1, 2].map(i => (
                  <tr key={i} aria-hidden="true">
                    {[0, 1, 2, 3].map(j => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3 animate-pulse rounded bg-line-soft" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map(captain => {
                  const busy = pendingId === captain.id;
                  return (
                    <tr key={captain.id} className="text-xs hover:bg-canvas">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-micro font-extrabold text-brand-deep">
                            {captain.name.slice(0, 2)}
                          </span>
                          <span>
                            <strong className="block font-bold text-ink">{captain.name}</strong>
                            <span className="block text-micro text-ink-muted" dir="ltr">
                              {captain.phone}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {captain.isVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-micro font-bold text-brand-deep">
                            <BadgeCheck size={12} /> موثّق
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-warning-tint px-2.5 py-1 text-micro font-bold text-warning-ink">
                            غير موثّق
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[11px] font-semibold text-ink-soft">
                        <label className="sr-only" htmlFor={`captain-store-${captain.id}`}>
                          Bind captain to a store
                        </label>
                        <select
                          id={`captain-store-${captain.id}`}
                          value={captain.assignedStoreId ?? ''}
                          disabled={busy}
                          onChange={event =>
                            void runAction(
                              captain.id,
                              () =>
                                updateMutation.run({ assignedStoreId: event.target.value || null }),
                              event.target.value
                                ? 'تم ربط السائق بالمطعم'
                                : 'تمت إعادة السائق إلى المجموعة العامة',
                              event.target.value
                                ? 'Captain bound to store'
                                : 'Captain assigned to general pool'
                            )
                          }
                          className="max-w-[180px] rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-semibold text-ink-soft outline-none focus:border-brand disabled:opacity-60"
                        >
                          <option value="">سائق عام / General driver</option>
                          {(stores.data?.items ?? []).map(store => (
                            <option key={store.id} value={store.id}>
                              {store.nameAr}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-micro font-bold ${
                            captain.isActive && captain.isAvailable
                              ? 'bg-brand-tint text-brand-deep'
                              : 'bg-canvas text-ink-muted'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${captain.isActive && captain.isAvailable ? 'bg-brand' : 'bg-ink-subtle'}`}
                          />
                          {!captain.isActive ? 'موقوف' : captain.isAvailable ? 'متاح' : 'غير متاح'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!captain.isVerified && (
                            <button
                              type="button"
                              disabled={busy || !captain.isActive}
                              onClick={() =>
                                void runAction(
                                  captain.id,
                                  () => verifyMutation.run(null),
                                  'تم توثيق الكابتن',
                                  'Captain verified'
                                )
                              }
                              className="rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
                            >
                              {busy && verifyMutation.pending ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                'توثيق'
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void runAction(
                                captain.id,
                                () => updateMutation.run({ isActive: !captain.isActive }),
                                captain.isActive
                                  ? 'تم إيقاف السائق ومنعه من استلام طلبات جديدة'
                                  : 'تمت إعادة تفعيل السائق',
                                captain.isActive
                                  ? 'Captain suspended from new assignments'
                                  : 'Captain reactivated'
                              )
                            }
                            className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-danger-tint hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
                          >
                            {busy && updateMutation.pending ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : captain.isActive ? (
                              'إيقاف'
                            ) : (
                              'إعادة تفعيل'
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setDeleteTarget(captain)}
                            className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-danger hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
                            aria-label={`Delete driver ${captain.name}`}
                          >
                            <Trash2 size={12} />
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
      <ConfirmDialog
        open={deleteTarget !== null}
        title="حذف السائق"
        en="Delete driver"
        message={
          deleteTarget
            ? `سيتم حذف حساب السائق «${deleteTarget.name}» (${deleteTarget.phone}) وبياناته المرتبطة نهائياً.`
            : ''
        }
        confirmLabelAr="حذف"
        confirmLabelEn="Delete"
        pending={deleteMutation.pending}
        onConfirm={() => void runDelete()}
        onClose={() => setDeleteTarget(null)}
      />
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
        <span dir="ltr">
          Page {page} / {last}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={disabled || page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:bg-canvas active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronRight size={13} />
          السابق{' '}
          <span dir="ltr" className="font-medium">
            Prev
          </span>
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={disabled || page >= last}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:bg-canvas active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span dir="ltr" className="font-medium">
            Next
          </span>{' '}
          التالي
          <ChevronLeft size={13} />
        </button>
      </div>
    </div>
  );
}

function PanelShell({
  title,
  en,
  loading,
  error,
  refreshing,
  onRefresh,
  headerActions,
  children,
}: PanelShellProps) {
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
          <p dir="ltr" className="mt-1 text-[11px] text-ink-muted">
            {en}
          </p>
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
