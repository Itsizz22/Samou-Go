/**
 * Samou' Go — live order tracking.
 *
 * Follows one order via `GET /orders/:id`. Updates arrive over a live SSE
 * channel (`/orders/events/:id`), with a 5 s polling safety net so a missed
 * push can never leave the customer staring at a stale screen. Both stop
 * themselves once the order reaches a terminal status — a delivered order has
 * nothing left to watch, and Samou' runs on metered mobile data.
 *
 * Nothing on this screen is invented. The timeline is derived from
 * `ORDER_STATUS_SEQUENCE` and the order's own `statusHistory`; the destination
 * is the customer's free-text address, because Samou' Go stores no coordinates
 * by design and there is no map to draw.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Store,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import {
  SignInGate,
  updateOrderStatus,
  updateProfile,
  useAuth,
  useMutation,
  useOrderEvent,
  useOrders,
  useToast,
} from '@samou-go/api-client';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEQUENCE,
  OrderStatus,
  UserRole,
  canRoleSetOrderStatus,
  canTransitionOrderStatus,
  isTerminalOrderStatus,
  type OrderDetail,
  type PublicUser,
  type UpdateOrderStatusInput,
  type UpdateProfileInput,
} from '@samou-go/shared-types';
import { HeaderNav } from './HeaderNav';
import { BottomTabs } from './BottomTabs';
import { OrderCard } from './OrderCard';
import { type BellNotification } from '@samou-go/ui';

/** Fast enough to feel live on the customer's side, gentle on mobile data. */
const POLL_MS = 5_000;

/** Where the customer home app is served — target of the "home" bottom tab. */
const HOME_URL: string = (
  import.meta.env.VITE_HOME_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:5173')
).replace(/\/+$/, '');

type TimelineState = 'completed' | 'active' | 'pending';

interface TimelineStep {
  status: OrderStatus;
  state: TimelineState;
  /** When the order entered this status, if it already has. */
  at: string | null;
}

/** `"12:42 · 28/07"` — enough to see progress without a full timestamp. */
function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
  return `${time} · ${day}`;
}

/**
 * The progress bar, derived rather than declared.
 *
 * A step is `completed` once the order has passed through it — either it is in
 * `statusHistory` or it sits before the current status in the canonical
 * sequence. Both checks are needed: history can be sparse (an admin may force a
 * jump), and a status can be current without history having caught up.
 */
function buildTimeline(order: OrderDetail): TimelineStep[] {
  const firstSeen = new Map<OrderStatus, string>();
  for (const entry of order.statusHistory) {
    if (!firstSeen.has(entry.status)) firstSeen.set(entry.status, entry.createdAt);
  }

  const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(order.status);
  const terminal = isTerminalOrderStatus(order.status);

  return ORDER_STATUS_SEQUENCE.map((status, index) => {
    const at = firstSeen.get(status) ?? null;
    let state: TimelineState;
    if (status === order.status) state = terminal ? 'completed' : 'active';
    else if (at !== null || (currentIndex >= 0 && index < currentIndex)) state = 'completed';
    else state = 'pending';
    return { status, state, at };
  });
}

export const LiveOrderTracking = () => {
  const auth = useAuth();
  const toast = useToast();

  // Bottom-tab state — "orders" is the default, "profile" swaps the whole
  // screen for the account panel; "home"/"explore" navigate to the home app.
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'orders' | 'profile'>('orders');

  /* ---- Which order? ----------------------------------------------------- */

  // `?orderId=` is what the checkout screen links to after placing an order.
  const orderIdParam = useMemo(
    () => new URLSearchParams(window.location.search).get('orderId'),
    []
  );
  const recent = useOrders(
    { pageSize: 1 },
    { enabled: !orderIdParam && Boolean(auth.user) }
  );
  const orderId = orderIdParam ?? recent.data?.items[0]?.id ?? null;

  /* ---- Live updates ------------------------------------------------------ */

  // SSE push channel with a polling safety net. Polling stops itself once the
  // order is delivered or cancelled: nothing left to watch, metered mobile data.
  const [live, setLive] = useState(true);
  const order = useOrderEvent(auth.user ? orderId : null, {
    ...(live ? { pollMs: POLL_MS } : { pollMs: 0 }),
  });

  useEffect(() => {
    if (!order.detail) return;
    setLive(!isTerminalOrderStatus(order.detail.status));
  }, [order.detail]);

  // Toast whenever the status advances — gives the customer an in-app
  // notification without requiring push notifications or a websocket.
  const prevStatusRef = useRef<OrderStatus | null>(null);
  useEffect(() => {
    if (!order.detail) return;
    const current = order.detail.status;
    const prev = prevStatusRef.current;
    if (prev !== null && prev !== current) {
      const label = ORDER_STATUS_LABELS[current];
      toast.info(
        `🔔 ${label.ar}`,
        `Order status: ${label.en}`
      );
    }
    prevStatusRef.current = current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.detail?.status]);

  /* ---- Cancel ----------------------------------------------------------- */

  const cancel = useMutation<UpdateOrderStatusInput, OrderDetail>((input, signal) =>
    updateOrderStatus(orderId as string, input, signal)
  );
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const detail = order.detail;
  // Three gates, the same three the server checks in `orders.service.ts`:
  // a legal edge, a role allowed to make it, and — server-side — ownership.
  const canCancel =
    detail !== null &&
    auth.user?.role === UserRole.CUSTOMER &&
    canTransitionOrderStatus(detail.status, OrderStatus.CANCELLED) &&
    canRoleSetOrderStatus(UserRole.CUSTOMER, OrderStatus.CANCELLED);

  const handleCancel = async () => {
    const result = await cancel.run({ status: OrderStatus.CANCELLED });
    setConfirmingCancel(false);
    if (result) order.reload();
  };

  /* ---- Profile (PATCH /auth/me) ------------------------------------------ */

  const profileMutation = useMutation<UpdateProfileInput, PublicUser>(
    (input, signal) => updateProfile(input, signal)
  );

  const handleSaveProfile = async (input: UpdateProfileInput) => {
    const result = await profileMutation.run(input);
    if (result) {
      auth.setUser(result);
      toast.success('تم تحديث الملف الشخصي', 'Profile updated');
    } else if (profileMutation.error) {
      toast.error('تعذّر تحديث الملف', profileMutation.error.message, { duration: 5_000 });
    }
    return result;
  };

  const handleCall = (phoneNumber: string) => {
    window.location.href = `tel:${phoneNumber}`;
  };

  /* ---- Gates ------------------------------------------------------------ */

  if (!auth.ready) {
    return (
      <main dir="rtl" className="min-h-screen bg-canvas pb-24" aria-busy="true">
        <HeaderNav title="Track Order" arabicTitle="تتبع الطلب" showBack={false} showCart={false} />
        <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-5" aria-hidden="true">
          <div className="h-[132px] animate-pulse rounded-xl bg-surface shadow-card" />
          <div className="h-[320px] animate-pulse rounded-xl bg-surface shadow-card" />
        </div>
      </main>
    );
  }

  if (!auth.user) {
    return <SignInGate auth={auth} reasonAr="سجّل الدخول لتتبّع طلبك" reasonEn="Sign in to track your order" />;
  }

  const loading = order.loading || (!orderIdParam && recent.loading);
  const error = order.error ?? (!orderIdParam ? recent.error : null);
  const noOrders = !loading && !error && !orderId;

  const timeline = detail && detail.status !== OrderStatus.CANCELLED ? buildTimeline(detail) : [];

  // The tracking screen's own bell: one live row for the order being watched,
  // re-keyed by status so each advance surfaces as a fresh unread notification.
  const bellNotifications: BellNotification[] = useMemo(() => {
    if (!detail) return [];
    return [{
      id: `order:${detail.id}:${detail.status}`,
      ar: `طلب ${detail.orderNumber} — ${ORDER_STATUS_LABELS[detail.status].ar}`,
      en: ORDER_STATUS_LABELS[detail.status].en,
      caption: detail.store.nameEn,
      href: `${window.location.pathname}?orderId=${encodeURIComponent(detail.id)}`,
      tone: detail.status === OrderStatus.CANCELLED ? 'danger' : 'info',
    }];
  }, [detail]);

  /* ---- Profile tab — swaps the whole screen ----------------------------- */

  if (activeTab === 'profile' && auth.user) {
    return (
      <main dir="rtl" className="min-h-screen bg-canvas pb-24 text-ink">
        <HeaderNav
          title="Profile"
          arabicTitle="حسابي"
          showBack
          showCart={false}
          notifications={bellNotifications}
          storageKey="tracking"
          onBack={() => setActiveTab('orders')}
        />
        <div className="mx-auto w-full max-w-md px-4 pb-8 pt-5">
          <CustomerProfileTab
            user={auth.user}
            pending={profileMutation.pending}
            savingError={profileMutation.error?.message}
            onSave={handleSaveProfile}
            onSignOut={auth.signOut}
          />
        </div>
        <BottomTabs activeTab="profile" onTabChange={setActiveTab} />
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-canvas pb-24 text-ink">
      <HeaderNav
        title="Track Order"
        arabicTitle="تتبع الطلب"
        showBack
        showCart={false}
        notifications={bellNotifications}
        storageKey="tracking"
        onBack={() => window.history.back()}
      />

      <div className="mx-auto w-full max-w-md px-4 pb-8 pt-5">
        <section aria-labelledby="tracking-heading" aria-busy={loading}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep">
                Live update
                {order.refreshing && (
                  <Loader2 size={13} className="animate-spin" aria-label="Refreshing" />
                )}
              </p>
              <h2 id="tracking-heading" className="text-2xl font-black tracking-tight text-ink">
                {detail ? ORDER_STATUS_LABELS[detail.status].ar : 'تتبّع طلبك'}
              </h2>
            </div>
            {detail && (
              <span dir="ltr" className="rounded-full bg-brand-tint px-3 py-1 text-xs font-bold text-brand-deep">
                #{detail.orderNumber}
              </span>
            )}
          </div>

          {error && (
            <div
              className="rounded-xl border border-danger-tint bg-surface p-5 text-center shadow-card"
              aria-live="assertive"
            >
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
                <AlertTriangle size={22} />
              </span>
              <h3 className="mt-3 text-sm font-extrabold">تعذّر تحميل حالة الطلب</h3>
              <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
                Could not load the order status
              </p>
              <p className="mt-2 text-xs text-ink-soft">{error.message}</p>
              <button
                type="button"
                onClick={orderIdParam ? order.reload : recent.refresh}
                disabled={order.refreshing || recent.refreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
              >
                {order.refreshing || recent.refreshing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                إعادة المحاولة <span dir="ltr">Retry</span>
              </button>
            </div>
          )}

          {noOrders && (
            <div
              className="rounded-xl border border-line bg-surface p-6 text-center shadow-card"
              aria-live="polite"
            >
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
                <Package size={22} />
              </span>
              <h3 className="mt-3 text-sm font-extrabold">لا توجد طلبات لتتبّعها</h3>
              <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
                You have no orders to track yet
              </p>
            </div>
          )}

          {loading && (
            <div className="h-[132px] animate-pulse rounded-xl bg-surface shadow-card" aria-hidden="true" />
          )}

          {detail && (
            <OrderCard
              id={detail.id}
              storeName={detail.store.nameEn}
              arabicStoreName={detail.store.nameAr}
              status={detail.status}
              itemsCount={detail.items.reduce((sum, item) => sum + item.quantity, 0)}
              totalPrice={detail.totalAmount}
              date={formatStamp(detail.createdAt)}
            />
          )}
        </section>

        {loading && (
          <div
            className="mt-7 h-[320px] animate-pulse rounded-xl bg-surface shadow-raised"
            aria-hidden="true"
          />
        )}

        {detail && detail.status === OrderStatus.CANCELLED && (
          <section
            className="mt-7 rounded-xl border border-danger-tint bg-surface p-6 text-center shadow-raised"
            aria-live="polite"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
              <XCircle size={26} />
            </span>
            <h2 className="mt-3 text-lg font-extrabold">{ORDER_STATUS_LABELS.CANCELLED.ar}</h2>
            <p className="mt-1 text-sm text-ink-muted" dir="ltr">
              {ORDER_STATUS_LABELS.CANCELLED.en}
            </p>
            {detail.statusHistory[detail.statusHistory.length - 1]?.note && (
              <p className="mt-3 text-xs text-ink-soft">{detail.statusHistory[detail.statusHistory.length - 1]?.note}</p>
            )}
          </section>
        )}

        {detail && timeline.length > 0 && (
          <section
            aria-labelledby="timeline-heading"
            className="mt-7 rounded-xl border border-line bg-surface p-5 shadow-raised"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 id="timeline-heading" className="text-lg font-extrabold text-ink">
                  Order progress
                </h2>
                <p className="mt-1 text-sm text-ink-muted">تقدم الطلب</p>
              </div>
              {live && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-brand-deep">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden="true" />
                  <span dir="ltr">Live</span>
                </span>
              )}
            </div>

            <ol className="space-y-0">
              {timeline.map((step, stepIndex) => {
                const label = ORDER_STATUS_LABELS[step.status];
                return (
                  <li key={step.status} className="relative flex min-h-[62px] gap-3">
                    <div className="flex w-7 shrink-0 flex-col items-center">
                      <span
                        className={`z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                          step.state === 'completed'
                            ? 'border-brand bg-brand text-white'
                            : step.state === 'active'
                              ? 'border-brand bg-surface text-brand ring-4 ring-brand-tint'
                              : 'border-line bg-surface text-ink-subtle'
                        }`}
                      >
                        {step.state === 'completed' ? (
                          <Check className="h-4 w-4" strokeWidth={3} aria-label="Completed" />
                        ) : step.state === 'active' ? (
                          <span
                            className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand"
                            aria-label="Active"
                          />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-line" aria-label="Pending" />
                        )}
                      </span>
                      {stepIndex < timeline.length - 1 && (
                        <span
                          className={`w-px flex-1 ${step.state === 'completed' ? 'bg-brand-soft' : 'bg-line'}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className={`pb-5 ${step.state === 'pending' ? 'opacity-55' : ''}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <h3
                          className={`text-sm font-extrabold ${step.state === 'active' ? 'text-brand-deep' : 'text-ink'}`}
                          dir="ltr"
                        >
                          {label.en}
                        </h3>
                        <span className="text-xs font-semibold text-ink-muted">{label.ar}</span>
                      </div>
                      {step.at && (
                        <p dir="ltr" className="mt-1 text-xs text-ink-muted">
                          {formatStamp(step.at)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {detail && (
          <section
            aria-labelledby="address-heading"
            className="mt-5 rounded-xl border border-line bg-surface p-5 shadow-raised"
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 id="address-heading" className="text-lg font-extrabold text-ink">
                  Delivery address
                </h2>
                <p className="mt-1 text-sm text-ink-muted">عنوان التوصيل</p>
              </div>
              <MapPin className="mt-1 h-5 w-5 text-brand" aria-hidden="true" />
            </div>
            <address className="not-italic rounded-lg bg-brand-surface p-4">
              <strong className="block text-sm font-extrabold text-ink">
                {detail.customerAddressText}
              </strong>
              {detail.addressNote && (
                <span className="mt-1 block text-xs text-ink-soft">{detail.addressNote}</span>
              )}
            </address>
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
              <Store className="h-4 w-4 text-brand" aria-hidden="true" />
              <span>
                {detail.captain
                  ? `الكابتن ${detail.captain.name} سيتواصل معك`
                  : 'سيتواصل معك الكابتن فور إسناد الطلب'}
              </span>
            </p>
          </section>
        )}

        {detail && (
          <section aria-labelledby="contact-heading" className="mt-5">
            <h2 id="contact-heading" className="mb-3 text-base font-extrabold text-ink">
              Need help? <span className="font-semibold text-ink-muted">تحتاج مساعدة؟</span>
            </h2>
            <div className={`grid gap-3 ${detail.captain ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <button
                type="button"
                onClick={() => handleCall(detail.store.phone)}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-brand-tint bg-brand-surface text-sm font-extrabold text-brand-deep transition hover:bg-brand-tint focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                <span>Call Store</span>
              </button>
              {detail.captain && (
                <button
                  type="button"
                  onClick={() => handleCall(detail.captain!.phone)}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-extrabold text-white shadow-card transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  <span>Call Captain</span>
                </button>
              )}
            </div>
          </section>
        )}

        {canCancel && (
          <section className="mt-5" aria-label="Cancel order">
            {cancel.error && (
              <p
                className="mb-3 flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-xs font-semibold text-danger-ink"
                aria-live="assertive"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{cancel.error.message}</span>
              </p>
            )}
            {confirmingCancel ? (
              <div className="rounded-xl border border-danger-tint bg-surface p-4 text-center shadow-card">
                <p className="text-sm font-extrabold text-ink">إلغاء هذا الطلب؟</p>
                <p className="mt-1 text-xs text-ink-muted" dir="ltr">
                  Cancel this order? This cannot be undone.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(false)}
                    disabled={cancel.pending}
                    className="h-11 rounded-xl border border-line bg-surface text-sm font-bold text-ink-soft transition hover:bg-canvas disabled:opacity-60"
                  >
                    تراجع <span dir="ltr">/ Keep</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCancel()}
                    disabled={cancel.pending}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-danger text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {cancel.pending && <Loader2 size={14} className="animate-spin" />}
                    تأكيد الإلغاء <span dir="ltr">/ Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingCancel(true)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-danger-tint bg-surface text-sm font-extrabold text-danger-ink transition hover:bg-danger-tint"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                إلغاء الطلب <span dir="ltr">/ Cancel order</span>
              </button>
            )}
          </section>
        )}
      </div>

      <BottomTabs
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'home' || tab === 'explore') {
            window.location.href = `${HOME_URL}/`;
            return;
          }
          setActiveTab(tab);
        }}
      />
    </main>
  );
};

/* ---------------------------------------------------------------------------
 * Profile tab — the customer edits their own name/phone/password via
 * `PATCH /auth/me`, the same endpoint the captain dashboard uses.
 * ------------------------------------------------------------------------- */

interface CustomerProfileTabProps {
  user: PublicUser;
  pending: boolean;
  savingError?: string;
  onSave: (input: UpdateProfileInput) => Promise<PublicUser | null>;
  onSignOut: () => void;
}

function CustomerProfileTab({ user, pending, savingError, onSave, onSignOut }: CustomerProfileTabProps) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    const changed = name.trim() !== user.name || phone.trim() !== user.phone;
    if (!changed && !newPassword) {
      setLocalError('لم تتغيّر أي بيانات / Nothing to update');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setLocalError('كلمتا المرور غير متطابقتين / Passwords do not match');
      return;
    }

    const input: UpdateProfileInput = {
      ...(name.trim() !== user.name ? { name: name.trim() } : {}),
      ...(phone.trim() !== user.phone ? { phone: phone.trim() } : {}),
      ...(newPassword ? { newPassword, currentPassword } : {}),
    };

    const result = await onSave(input);
    if (result) {
      setSaved(true);
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const fieldClass =
    'w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';

  return (
    <section aria-labelledby="profile-tab-title" className="pt-2">
      <div className="mb-4">
        <h2 id="profile-tab-title" className="text-lg font-extrabold">حسابي</h2>
        <p dir="ltr" className="text-sm text-ink-muted">Profile &amp; Account</p>
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3 border-b border-line-soft pb-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-base font-extrabold text-brand-deep">
              {user.name.slice(0, 2)}
            </span>
            <div>
              <p className="text-sm font-extrabold">{user.name}</p>
              <p className="text-sm text-ink-muted" dir="ltr">{user.phone}</p>
            </div>
            <span className="ms-auto flex h-9 w-9 items-center justify-center rounded-full bg-brand-surface text-brand">
              <UserRound size={18} />
            </span>
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-bold text-ink">الاسم الكامل / Full name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
          </label>

          <label className="mt-3 block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-ink">
              <Phone size={12} className="text-brand" /> رقم الجوال / Mobile
            </span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className={fieldClass} />
          </label>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="text-sm font-extrabold text-ink">تغيير كلمة المرور <span dir="ltr" className="font-medium text-ink-muted">/ Change password</span></p>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-bold text-ink">كلمة المرور الحالية / Current password</span>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={fieldClass} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-bold text-ink">كلمة مرور جديدة / New password</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={fieldClass} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-bold text-ink">تأكيد كلمة المرور / Confirm password</span>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={fieldClass} />
          </label>
        </div>

        {(localError || savingError) && (
          <p className="flex items-start gap-1.5 rounded-xl bg-danger-tint px-3 py-2 text-sm font-semibold text-danger-ink" role="alert">
            <X size={13} className="mt-0.5 shrink-0" />
            {localError ?? savingError}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          {saved ? 'تم الحفظ ✓ / Saved' : 'حفظ التغييرات / Save changes'}
        </button>
      </form>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-danger-tint py-3 text-sm font-bold text-danger transition hover:bg-danger-tint"
      >
        <LogOut size={14} />
        تسجيل الخروج <span dir="ltr" className="font-medium text-danger/70">/ Sign out</span>
      </button>
    </section>
  );
}
