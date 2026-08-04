/**
 * Samou' Go — Admin Dashboard.
 *
 * KPIs, the live orders table, and recent activity are all driven by the real
 * API. The weekly bar chart and the donut remain illustrative — there is no
 * time-series endpoint yet. The sidebar navigation is presentational (no
 * separate admin routes exist yet either).
 *
 * Auth gate: ADMIN role required. Any other role sees an access-denied screen.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Search,
  Settings,
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
  useAuth,
  useOrders,
  useStores,
} from '@/hooks/useApi';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  OrderStatus,
  UserRole,
  type OrderSummary,
} from '@samou-go/shared-types';
import { tokens } from '@/theme/tokens';

/* ---------------------------------------------------------------------------
 * Static data (presentational — no API endpoint yet)
 * ------------------------------------------------------------------------- */

const navItems = [
  { label: 'Dashboard', arabic: 'لوحة التحكم', icon: LayoutDashboard },
  { label: 'Users', arabic: 'المستخدمون', icon: Users },
  { label: 'Stores', arabic: 'المتاجر', icon: Store },
  { label: 'Captains', arabic: 'السائقون', icon: Truck },
  { label: 'Orders', arabic: 'الطلبات', icon: Package },
  { label: 'Finance', arabic: 'المالية', icon: WalletCards },
  { label: 'Reports', arabic: 'التقارير', icon: BarChart3 },
  { label: 'Settings', arabic: 'الإعدادات', icon: Settings },
] as const;

const weeklyOrders = [
  { day: 'Sat', arabic: 'السبت', value: 58 },
  { day: 'Sun', arabic: 'الأحد', value: 76 },
  { day: 'Mon', arabic: 'الإثنين', value: 64 },
  { day: 'Tue', arabic: 'الثلاثاء', value: 91 },
  { day: 'Wed', arabic: 'الأربعاء', value: 83 },
  { day: 'Thu', arabic: 'الخميس', value: 112 },
  { day: 'Fri', arabic: 'الجمعة', value: 142 },
];

const maxWeekly = Math.max(...weeklyOrders.map((w) => w.value));

/* ---------------------------------------------------------------------------
 * Status tone helpers
 * ------------------------------------------------------------------------- */

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

/** `"12:42"` — HH:MM for the table. */
function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/* ---------------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------------- */

export function SamouGoAdminDashboard() {
  const auth = useAuth();
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ---- Live data --------------------------------------------------------- */

  const isAdmin = auth.user?.role === UserRole.ADMIN;

  // KPI: total orders
  const totalOrders = useOrders(
    { pageSize: 1 },
    { enabled: isAdmin }
  );
  // KPI: active deliveries (ON_THE_WAY)
  const activeDeliveries = useOrders(
    { status: OrderStatus.ON_THE_WAY, pageSize: 1 },
    { enabled: isAdmin }
  );
  // KPI: registered stores
  const storeCount = useStores(
    { pageSize: 1 },
    { enabled: isAdmin }
  );
  // Live orders table (5 most recent)
  const liveOrders = useOrders(
    { pageSize: 5 },
    { enabled: isAdmin }
  );

  /* ---- Loading gates ----------------------------------------------------- */

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

  /* ---- Derived values ---------------------------------------------------- */

  const kpis = [
    {
      label: 'Total Orders',
      arabic: 'إجمالي الطلبات',
      value: totalOrders.loading ? null : (totalOrders.data?.total ?? 0),
      unit: 'طلب',
      icon: ClipboardList,
    },
    {
      label: 'Active Deliveries',
      arabic: 'توصيل نشط',
      value: activeDeliveries.loading ? null : (activeDeliveries.data?.total ?? 0),
      unit: 'توصيل',
      icon: Truck,
    },
    {
      label: 'Registered Stores',
      arabic: 'المتاجر المسجلة',
      value: storeCount.loading ? null : (storeCount.data?.total ?? 0),
      unit: 'متجر',
      icon: Store,
    },
    {
      label: 'Revenue Today',
      arabic: 'الإيرادات اليوم',
      value: null, // No revenue endpoint yet — shown as placeholder
      unit: 'ILS',
      icon: CircleDollarSign,
      placeholder: '—',
    },
  ];

  const ordersError = liveOrders.error;
  const ordersLoading = liveOrders.loading;
  const orderRows: OrderSummary[] = liveOrders.data?.items ?? [];

  /* ---- Render ------------------------------------------------------------ */

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
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.label;
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => { setActiveNav(item.label); setSidebarOpen(false); }}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition ${
                      active ? 'bg-brand text-white shadow-raised' : 'text-white/75 hover:bg-surface/10 hover:text-white'
                    }`}
                  >
                    <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                    <span className="flex-1 text-[13px] font-semibold">{item.label}</span>
                    <span dir="rtl" className={`text-[12px] ${active ? 'text-white/85' : 'text-white/65'}`}>
                      {item.arabic}
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
        {/* Header */}
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
                Dashboard <span className="font-semibold text-ink-muted">/ لوحة التحكم</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            <label className="hidden h-10 w-[205px] items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-ink-muted md:flex">
              <Search size={17} />
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-ink-subtle"
                placeholder="Search / بحث..."
                aria-label="Search dashboard"
              />
            </label>
            <button
              type="button"
              className="relative rounded-xl p-2.5 text-ink-soft hover:bg-brand-surface"
              aria-label="Notifications"
            >
              <Bell size={19} />
              <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-danger" />
            </button>
            <span className="hidden h-8 w-px bg-line md:block" />
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-xs font-extrabold text-brand-dark">
                {auth.user.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden text-end md:block">
                <strong className="block text-xs">{auth.user.name}</strong>
                <span dir="rtl" className="block text-[10px] text-ink-muted">مدير النظام</span>
              </span>
              <ChevronDown size={14} className="hidden text-ink-muted md:block" />
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-9">
          {/* KPIs */}
          <section aria-labelledby="overview-title">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand">Overview</p>
                <h2 id="overview-title" className="mt-1 text-[20px] font-extrabold tracking-[-0.025em]">
                  مرحباً، {auth.user.name} <span aria-hidden="true">👋</span>
                </h2>
              </div>
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
                    <p className="mt-5 text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink">
                      {kpi.value === null ? (
                        <span className="inline-block h-8 w-16 animate-pulse rounded bg-line-soft" aria-hidden="true" />
                      ) : (
                        <>
                          {'placeholder' in kpi ? kpi.placeholder : kpi.value}{' '}
                          <span className="text-sm font-bold tracking-normal text-ink-muted">{kpi.unit}</span>
                        </>
                      )}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-ink-soft">{kpi.label}</p>
                    <p dir="rtl" className="mt-0.5 text-[11px] text-ink-subtle">{kpi.arabic}</p>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Live Orders table */}
          <section className="mt-7 grid gap-5 xl:grid-cols-[1.55fr_1fr]" aria-label="Orders and activity">
            <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              <div className="flex items-center justify-between border-b border-line-soft px-5 py-5">
                <div>
                  <h2 className="text-[15px] font-extrabold">Live Orders</h2>
                  <p className="mt-1 text-[11px] text-ink-muted">الطلبات المباشرة</p>
                </div>
                <button
                  type="button"
                  onClick={() => void liveOrders.reload()}
                  disabled={liveOrders.refreshing}
                  className="flex items-center gap-1.5 text-xs font-bold text-brand hover:text-brand-dark disabled:opacity-60"
                >
                  {liveOrders.refreshing
                    ? <Loader2 size={13} className="animate-spin" />
                    : <RefreshCw size={13} />}
                  Refresh
                </button>
              </div>

              {ordersError && (
                <div className="p-5 text-center" aria-live="assertive">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
                    <AlertTriangle size={18} />
                  </span>
                  <p className="mt-2 text-xs font-semibold text-danger-ink">{ordersError.message}</p>
                  <button
                    type="button"
                    onClick={() => void liveOrders.reload()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-dark"
                  >
                    <RefreshCw size={12} /> إعادة المحاولة
                  </button>
                </div>
              )}

              {!ordersError && (
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
                      {ordersLoading
                        ? [0, 1, 2, 3, 4].map((i) => (
                            <tr key={i} aria-hidden="true">
                              {[0, 1, 2, 3, 4, 5].map((j) => (
                                <td key={j} className="px-5 py-4">
                                  <div className="h-3 animate-pulse rounded bg-line-soft" />
                                </td>
                              ))}
                            </tr>
                          ))
                        : orderRows.map((order) => (
                            <tr key={order.id} className="text-xs hover:bg-canvas">
                              <td className="px-5 py-4 font-bold text-brand-deep" dir="ltr">
                                {order.orderNumber}
                              </td>
                              <td className="px-3 py-4 text-ink-muted">{order.storeNameAr}</td>
                              <td className="px-3 py-4 text-ink-muted">{order.itemCount}</td>
                              <td className="px-3 py-4">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${statusBadgeClass(order.status)}`}>
                                  {ORDER_STATUS_LABELS[order.status].ar}
                                  <span className="ms-1 font-medium opacity-75" dir="ltr">
                                    · {ORDER_STATUS_LABELS[order.status].en}
                                  </span>
                                </span>
                              </td>
                              <td className="px-3 py-4 text-ink-muted" dir="ltr">
                                {shortTime(order.createdAt)}
                              </td>
                              <td className="px-5 py-4 text-end font-extrabold text-brand-deep" dir="ltr">
                                ₪{order.totalAmount.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                  {!ordersLoading && orderRows.length === 0 && (
                    <p className="py-8 text-center text-xs text-ink-muted">لا توجد طلبات حتى الآن</p>
                  )}
                </div>
              )}
            </article>

            {/* Recent activity — derived from live orders */}
            <article className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <div>
                <h2 className="text-[15px] font-extrabold">Recent Activity</h2>
                <p className="mt-1 text-[11px] text-ink-muted">آخر النشاطات · Live orders</p>
              </div>
              <ul className="mt-5 divide-y divide-line-soft">
                {ordersLoading
                  ? [0, 1, 2, 3].map((i) => (
                      <li key={i} className="flex gap-3 py-3" aria-hidden="true">
                        <div className="h-9 w-9 animate-pulse rounded-xl bg-line-soft" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-2/3 animate-pulse rounded bg-line-soft" />
                          <div className="h-2.5 w-1/2 animate-pulse rounded bg-line-soft" />
                        </div>
                      </li>
                    ))
                  : orderRows.slice(0, 4).map((order) => (
                      <li key={`activity:${order.id}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${statusBadgeClass(order.status)}`}>
                          <Package size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-brand-deep">{order.storeNameAr}</p>
                          <p dir="ltr" className="mt-0.5 truncate text-[10px] text-ink-muted">
                            {order.orderNumber}
                          </p>
                          <p className="mt-1 truncate text-[10px] text-ink-subtle">
                            {ORDER_STATUS_LABELS[order.status].ar}
                          </p>
                        </div>
                        <time className="shrink-0 text-[10px] text-ink-subtle" dir="ltr">
                          {shortTime(order.createdAt)}
                        </time>
                      </li>
                    ))}
                {!ordersLoading && orderRows.length === 0 && (
                  <li className="py-4 text-center text-xs text-ink-muted">لا يوجد نشاط</li>
                )}
              </ul>
            </article>
          </section>

          {/* Weekly chart + donut — presentational */}
          <section className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]" aria-label="Weekly analytics">
            <article className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[15px] font-extrabold">Daily Orders</h2>
                  <p className="mt-1 text-[11px] text-ink-muted">الطلبات اليومية · This week (illustrative)</p>
                </div>
              </div>
              <div className="mt-7 flex h-[180px] items-end justify-between gap-3 border-b border-line px-2 pb-0">
                {weeklyOrders.map((item) => (
                  <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <span className="text-[10px] font-bold text-ink-muted">{item.value}</span>
                    <span
                      className={`w-full max-w-[40px] rounded-t-md transition hover:bg-brand-dark ${item.day === 'Fri' ? 'bg-brand' : 'bg-brand-soft'}`}
                      style={{ height: `${(item.value / maxWeekly) * 118}px` }}
                      title={`${item.value} orders`}
                    />
                    <span className="pb-3 text-[10px] text-ink-muted">{item.day}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between px-2 text-[9px] text-ink-subtle">
                {weeklyOrders.map((item) => <span key={item.arabic}>{item.arabic}</span>)}
              </div>
            </article>

            <article className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <div>
                <h2 className="text-[15px] font-extrabold">Orders by Category</h2>
                <p className="mt-1 text-[11px] text-ink-muted">الطلبات حسب الفئة · Illustrative</p>
              </div>
              <div className="mt-6 flex items-center justify-center gap-8 sm:gap-12">
                <div
                  className="relative flex h-[145px] w-[145px] items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(${tokens.brand} 0 54%, ${tokens.brandSoft} 54% 78%, ${tokens.brandTint} 78% 100%)`,
                  }}
                >
                  <span className="flex h-[82px] w-[82px] flex-col items-center justify-center rounded-full bg-surface">
                    <strong className="text-xl font-extrabold text-brand-deep">
                      {totalOrders.loading ? '…' : (totalOrders.data?.total ?? 0)}
                    </strong>
                    <span className="text-[10px] text-ink-muted">orders</span>
                  </span>
                </div>
                <ul className="space-y-4 text-[11px]">
                  <li className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                    <span className="text-ink-soft">Restaurants</span>
                    <strong className="ms-2 text-brand-deep">54%</strong>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-soft" />
                    <span className="text-ink-soft">Pharmacy</span>
                    <strong className="ms-2 text-brand-deep">24%</strong>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-tint" />
                    <span className="text-ink-soft">Supermarket</span>
                    <strong className="ms-2 text-brand-deep">22%</strong>
                  </li>
                </ul>
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}
