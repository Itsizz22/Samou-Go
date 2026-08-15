/**
 * Samou' Go — delivery captain dashboard.
 *
 * Reads available orders via `GET /orders` filtered to READY_FOR_PICKUP, and
 * lets the captain accept them (ON_THE_WAY) and mark them DELIVERED. Completed
 * deliveries and today's earnings are derived from the same live data.
 *
 * The captain owns the road half of the lifecycle: READY_FOR_PICKUP → ON_THE_WAY
 * → DELIVERED. The captain may also cancel an active order.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Loader2,
  LogOut,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  StickyNote,
  Store as StoreIcon,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import {
  SignInGate,
  setAvailability,
  updateOrderStatus,
  updateProfile,
  useAuth,
  useMutation,
  useOrder,
  useOrders,
  useToast,
  connectRealtime,
} from '@samou-go/api-client';
import {
  Badge,
  LanguageToggle,
  NotificationBell,
  ThemeToggle,
  type BellNotification,
} from '@samou-go/ui';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  OrderStatus,
  UserRole,
  canRoleSetOrderStatus,
  canTransitionOrderStatus,
  type OrderDetail,
  type OrderSummary,
  type PublicUser,
  type UpdateOrderStatusInput,
  type UpdateProfileInput,
} from '@samou-go/shared-types';
import { FREE_DELIVERY_LABEL } from '@/lib/delivery';
import { LeafletMap } from '@samou-go/ui/map';

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

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
 * Navigation
 * ------------------------------------------------------------------------- */

const NAV_ITEMS = [
  { id: 'home', label: 'الرئيسية', english: 'Home', icon: Navigation },
  { id: 'orders', label: 'الطلبات', english: 'Orders', icon: Package },
  { id: 'map', label: 'الخريطة', english: 'Map', icon: MapPin },
  { id: 'earnings', label: 'الأرباح', english: 'Earnings', icon: WalletCards },
  { id: 'account', label: 'حسابي', english: 'Account', icon: UserRound },
] as const;

/** Captain's flat earnings per completed delivery, in ILS. */
const CAPTAIN_RATE_PER_DELIVERY = 3;

/* ---- Google Maps navigation ---------------------------------------------- */

/** Directions to a coordinate pair, e.g. the store. Falls back to a query when a coordinate is missing. */
function mapsDirections(destination: { latitude: number | null; longitude: number | null; label: string }): string {
  const hasCoords =
    typeof destination.latitude === 'number' &&
    typeof destination.longitude === 'number' &&
    Number.isFinite(destination.latitude) &&
    Number.isFinite(destination.longitude);
  const target = hasCoords
    ? `${destination.latitude},${destination.longitude}`
    : `${destination.label}, Al-Samou', Hebron`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`;
}

/** Directions to a customer landing (Samou' has no customer GPS, so it uses the free-text address). */
function mapsDirectionsToAddress(addressText: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${addressText}, Al-Samou', Hebron`)}`;
}

/* ---------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------- */

export function SamouGoCaptain() {
  const auth = useAuth();
  const toast = useToast();

  const [available, setAvailable] = useState<boolean>(auth.user?.isAvailable ?? false);
  const [activeTab, setActiveTab] = useState('home');

  // Availability is server state — re-sync whenever the profile reloads so the
  // header reflects the last PATCH, not the last local flip.
  useEffect(() => {
    if (auth.user) setAvailable(auth.user.isAvailable);
  }, [auth.user?.isAvailable]);

  /* ---- Role gate --------------------------------------------------------- */

  const isCaptain = auth.user?.role === UserRole.CAPTAIN;

  /* ---- Data -------------------------------------------------------------- */

  // Available orders: READY_FOR_PICKUP — the kitchen is done, the road is waiting.
  // Polled every 10 s so a freshly prepared order surfaces without a refresh.
  const availableOrders = useOrders(
    { status: OrderStatus.READY_FOR_PICKUP, pageSize: 20 },
    { enabled: Boolean(auth.user) && isCaptain, pollMs: 10_000 }
  );

  // Orders the captain is currently delivering.
  const activeOrders = useOrders(
    { status: OrderStatus.ON_THE_WAY, pageSize: 10 },
    { enabled: Boolean(auth.user) && isCaptain, pollMs: 10_000 }
  );

  // Today's completed deliveries — total count for earnings.
  const completedOrders = useOrders(
    { status: OrderStatus.DELIVERED, pageSize: 100 },
    { enabled: Boolean(auth.user) && isCaptain }
  );

  const availableItems: OrderSummary[] = useMemo(
    () => availableOrders.data?.items ?? [],
    [availableOrders.data]
  );
  const activeItems: OrderSummary[] = useMemo(
    () => activeOrders.data?.items ?? [],
    [activeOrders.data]
  );

  const activeOrderDetail = useOrder(activeItems[0]?.id, { enabled: Boolean(auth.user) && isCaptain, pollMs: 10_000 });

  useEffect(() => {
    if (!isCaptain || !activeItems[0]?.id || !navigator.geolocation) return;
    const socket = connectRealtime();
    const orderId = activeItems[0].id;
    const watchId = navigator.geolocation.watchPosition((position) => {
      socket.emit('captain:location', { orderId, lat: position.coords.latitude, lng: position.coords.longitude, heading: position.coords.heading ?? undefined });
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 5_000 });
    return () => { navigator.geolocation.clearWatch(watchId); socket.disconnect(); };
  }, [activeItems, isCaptain]);

  const completedToday = useMemo(() => {
    const today = new Date().toDateString();
    return (completedOrders.data?.items ?? []).filter((order) => new Date(order.createdAt).toDateString() === today);
  }, [completedOrders.data]);

  const todayDeliveries = completedToday.length;
  const todayCash = useMemo(() => completedToday.reduce((total, order) => total + order.totalAmount, 0), [completedToday]);
  const todayEarnings = useMemo(() => {
    // Delivery fees are FREE platform-wide (0 ₪), so the captain's earnings are
    // the flat per-delivery rate, not a share of any delivery fee.
    return todayDeliveries * CAPTAIN_RATE_PER_DELIVERY;
  }, [todayDeliveries]);

  /* ---- New available-order toast ------------------------------------------ */

  // Announce a READY_FOR_PICKUP order the captain has not seen yet, once per
  // order, so the first poll does not toast a backlog of history.
  const announcedAvailableIds = useRef<Set<string>>(new Set());
  const availableLoadedOnce = useRef(false);

  useEffect(() => {
    if (availableOrders.loading || !isCaptain || !auth.user) return;
    const ids = new Set(availableItems.map((order) => order.id));
    const fresh = availableItems.filter((order) => !announcedAvailableIds.current.has(order.id));

    if (!availableLoadedOnce.current) {
      availableLoadedOnce.current = true;
      announcedAvailableIds.current = ids;
      return;
    }

    if (fresh.length > 0) {
      for (const order of fresh) announcedAvailableIds.current.add(order.id);
      const first = fresh[0];
      toast.info(
        `🛵 طلب جديد جاهز للاستلام من ${first?.storeNameAr ?? ''}`,
        `${fresh.length} new order${fresh.length === 1 ? '' : 's'} ready for pickup`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableItems, availableOrders.loading, isCaptain, auth.user]);

  /* ---- Mutations --------------------------------------------------------- */

  interface TransitionInput { orderId: string; status: OrderStatus }

  const acceptMutation = useMutation<TransitionInput, OrderDetail>(
    (input, signal) => updateOrderStatus(input.orderId, { status: input.status }, signal)
  );

  const deliverMutation = useMutation<TransitionInput, OrderDetail>(
    (input, signal) => updateOrderStatus(input.orderId, { status: input.status }, signal)
  );

  const handleAccept = async (orderId: string) => {
    const result = await acceptMutation.run({ orderId, status: OrderStatus.ON_THE_WAY });
    if (result) {
      toast.success('تم استلام الطلب للتوصيل', 'Order picked up — heading to the customer');
      void availableOrders.reload();
      void activeOrders.reload();
    } else if (acceptMutation.error) {
      // 409 = another captain claimed it first (optimistic lock)
      if (acceptMutation.error.status === 409) {
        toast.error('سبقك كابتن آخر إلى هذا الطلب', 'Another captain just claimed this order');
      } else {
        toast.error('تعذّر قبول الطلب', acceptMutation.error.message, { duration: 5_000 });
      }
      // Refresh the pool so the claimed order disappears immediately.
      void availableOrders.reload();
    }
  };

  const handleDeliver = async (orderId: string) => {
    const result = await deliverMutation.run({ orderId, status: OrderStatus.DELIVERED });
    if (result) {
      toast.success('تم توصيل الطلب بنجاح', 'Order delivered successfully');
    } else if (deliverMutation.error) {
      toast.error('تعذّر تأكيد التوصيل', deliverMutation.error.message, { duration: 5_000 });
    }
    void activeOrders.reload();
    void completedOrders.reload();
  };

  /* ---- Availability (persisted) ------------------------------------------ */

  const availabilityMutation = useMutation<{ isAvailable: boolean }, PublicUser>(
    (input, signal) => setAvailability(input, signal)
  );

  const handleToggleAvailability = async () => {
    const next = !available;
    // Optimistic flip so the header answers instantly on Samou' mobile data.
    setAvailable(next);
    const result = await availabilityMutation.run({ isAvailable: next });
    if (result) {
      auth.setUser(result);
      toast.success(
        next ? 'أصبحت متاحاً لاستلام الطلبات 🛵' : 'غادرت وضع الاستلام',
        next ? 'You are now available for jobs' : 'You are now offline'
      );
    } else if (availabilityMutation.error) {
      setAvailable(!next);
      toast.error('تعذّر تحديث حالتك', availabilityMutation.error.message, { duration: 5_000 });
    }
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

  /* ---- Bell notifications (derived from the live available-orders pool) -- */

  const bellNotifications: BellNotification[] = useMemo(
    () =>
      availableItems.map((order) => {
        const time = relativeTime(order.createdAt);
        return {
          id: `ready:${order.id}`,
          ar: `طلب جاهز للاستلام — ${order.storeNameAr}`,
          en: 'Order ready for pickup',
          caption: `${time.ar} · ${FREE_DELIVERY_LABEL.ar}`,
          tone: 'brand',
        };
      }),
    [availableItems]
  );

  /* ---- Gates ------------------------------------------------------------- */

  if (!auth.ready) {
    return (
      <main className="min-h-screen bg-canvas pb-24" aria-busy="true">
        <header className="bg-brand px-4 pb-4 pt-3 text-white">
          <div className="mx-auto flex max-w-md items-center justify-between" aria-hidden="true">
            <span className="h-10 w-10 rounded-full bg-surface/15" />
            <span className="h-5 w-32 rounded bg-surface/20" />
            <span className="h-10 w-10 rounded-full bg-surface/15" />
          </div>
        </header>
        <div className="mx-auto max-w-md space-y-4 px-4 pt-5" aria-hidden="true">
          <div className="h-32 animate-pulse rounded-2xl bg-surface shadow-card" />
          <div className="h-40 animate-pulse rounded-2xl bg-surface shadow-card" />
        </div>
      </main>
    );
  }

  if (!auth.user) {
    return (
      <SignInGate
        auth={auth}
        reasonAr="سجّل الدخول لاستلام طلبات التوصيل"
        reasonEn="Sign in to accept delivery orders"
      />
    );
  }

  const loading = availableOrders.loading && activeOrders.loading;
  const error = availableOrders.error ?? activeOrders.error ?? completedOrders.error;
  const captainName = auth.user.name;

  /* ---- Tab sections -------------------------------------------------------
   * Extracted into variables so the bottom tabs can reuse the same JSX —
   * "orders" and "earnings" render the home sections without duplicating them.
   * ------------------------------------------------------------------------- */

  const earningsSection = (
    <section aria-labelledby="earnings-title" className="-mt-1 rounded-b-[24px] bg-gradient-to-br from-brand-dark via-brand to-brand px-5 pb-5 pt-4 text-white shadow-raised">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-semibold text-white/85">أرباح اليوم</p>
          <p dir="ltr" className="text-[11px] text-white/80">Today's Earnings</p>
        </div>
        <WalletCards size={21} className="text-white/80" />
      </div>
      <p id="earnings-title" dir="ltr" className="mt-1 text-[32px] font-black tracking-tight">
        {completedOrders.loading ? (
          <span className="inline-block h-8 w-20 animate-pulse rounded bg-surface/25" aria-hidden="true" />
        ) : (
          `${todayEarnings} ₪`
        )}
      </p>
      <div className="mt-1 flex items-center gap-5 text-[11px] font-semibold text-white/85">
        <span>
          {todayDeliveries} توصيلات <b dir="ltr" className="font-normal">/ {todayDeliveries} Deliveries</b>
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/20 pt-3 text-[11px]">
        <span>النقد المحصّل <b dir="ltr" className="block mt-1 text-base">₪{todayCash.toFixed(2)}</b></span>
        <span>عمولتك <b dir="ltr" className="block mt-1 text-base">₪{todayEarnings.toFixed(2)}</b></span>
      </div>
    </section>
  );

  const availableOrdersSection = (
    <section aria-labelledby="orders-title" className="mt-6">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 id="orders-title" className="text-[17px] font-extrabold">
            طلبات متاحة <span className="me-1 text-brand">{availableItems.length}</span>
          </h2>
          <p dir="ltr" className="text-[11px] text-ink-muted">Available Orders</p>
        </div>
      </div>

      <div className="space-y-3">
        {loading && availableItems.length === 0
          ? [0, 1].map((index) => (
              <div key={index} className="h-32 animate-pulse rounded-2xl bg-surface shadow-card" aria-hidden="true" />
            ))
          : error && availableItems.length === 0
            ? (
              <div className="rounded-2xl border border-danger-tint bg-surface p-6 text-center shadow-card" role="alert" aria-live="assertive">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
                  <AlertTriangle size={22} />
                </span>
                <h3 className="mt-3 text-sm font-extrabold">تعذّر تحميل الطلبات</h3>
                <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">Could not load orders</p>
                <p className="mt-2 text-xs text-ink-soft">{error.message}</p>
                <button
                  type="button"
                  onClick={() => { void availableOrders.refresh(); void activeOrders.refresh(); void completedOrders.refresh(); }}
                  disabled={availableOrders.refreshing || activeOrders.refreshing}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                >
                  {availableOrders.refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  إعادة المحاولة <span dir="ltr">Retry</span>
                </button>
              </div>
            )
            : availableItems.length === 0
            ? (
              <div className="rounded-2xl bg-surface p-6 text-center shadow-card">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
                  <Package size={22} />
                </span>
                <h3 className="mt-3 text-sm font-extrabold">لا توجد طلبات متاحة</h3>
                <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">No available orders</p>
              </div>
            )
            : availableItems.map((order) => {
                const time = relativeTime(order.createdAt);
                return (
                  <article key={order.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-[14px] font-extrabold">{order.storeNameAr}</h3>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          {time.ar} <span dir="ltr" className="text-ink-subtle">· {time.en}</span>
                        </p>
                      </div>
                      <span dir="ltr" className="rounded-lg bg-brand-tint px-2.5 py-1 text-[12px] font-black text-brand-dark">
                        {FREE_DELIVERY_LABEL.en}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted">
                      <Badge tone={ORDER_STATUS_TONES[order.status]} dot>
                        {ORDER_STATUS_LABELS[order.status].ar}
                        <span dir="ltr" className="font-semibold"> / {ORDER_STATUS_LABELS[order.status].en}</span>
                      </Badge>
                      <span>{order.itemCount} items</span>
                    </div>
                    {canTransitionOrderStatus(order.status, OrderStatus.ON_THE_WAY) &&
                      canRoleSetOrderStatus(UserRole.CAPTAIN, OrderStatus.ON_THE_WAY) && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAccept(order.id)}
                          disabled={acceptMutation.pending}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2 text-[11px] font-extrabold text-white transition hover:bg-brand-dark disabled:opacity-60"
                        >
                          {acceptMutation.pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          <span>قبول / Accept</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // "Ignore" just collapses the card from the local list
                            // by reloading — the order stays in the pool for other
                            // captains. We mark it locally skipped so it doesn't
                            // re-announce via the toast on the next poll.
                            announcedAvailableIds.current.add(order.id);
                            void availableOrders.reload();
                          }}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-[11px] font-bold text-ink-muted transition hover:bg-brand-surface"
                          aria-label="Ignore order"
                        >
                          <X size={14} />
                          <span>تجاهل / Ignore</span>
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
      </div>
    </section>
  );

  const todaySection = (
    <section aria-labelledby="today-title" className="mt-6 mb-6">
      <div className="mb-3">
        <h2 id="today-title" className="text-[17px] font-extrabold">توصيلات اليوم</h2>
        <p dir="ltr" className="text-[11px] text-ink-muted">Today's Deliveries</p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        {completedOrders.loading ? (
          <div className="px-4 py-5 text-center">
            <Loader2 size={16} className="mx-auto animate-spin text-brand" />
          </div>
        ) : completedOrders.error ? (
          <div className="flex items-center justify-center gap-2 px-4 py-5 text-center">
            <p className="text-[12px] text-danger-ink">{completedOrders.error.message}</p>
            <button
              type="button"
              onClick={() => void completedOrders.refresh()}
              disabled={completedOrders.refreshing}
              className="inline-flex items-center gap-1 rounded-lg border border-danger/30 bg-surface px-2 py-1 text-[11px] font-bold text-danger-ink transition active:scale-95 disabled:opacity-60"
            >
              {completedOrders.refreshing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              إعادة المحاولة
            </button>
          </div>
        ) : completedOrders.data?.total === 0 ? (
          <div className="px-4 py-5 text-center text-[12px] text-ink-muted">
            لا توجد توصيلات مكتملة اليوم <span dir="ltr">/ No deliveries today</span>
          </div>
        ) : (
          <div className="px-4 py-5 text-center">
            <p className="text-sm font-extrabold text-ink">{todayDeliveries} توصيلات مكتملة</p>
            <p dir="ltr" className="text-xs text-ink-muted">{todayDeliveries} deliveries completed</p>
          </div>
        )}
      </div>
    </section>
  );

  /* ---- Render ------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-canvas pb-24 font-sans text-ink md:pe-60">
      <aside className="fixed inset-y-0 end-0 z-30 hidden w-60 flex-col bg-brand-deep px-4 py-6 text-white md:flex" aria-label="تنقل الكابتن">
        <p className="px-3 text-lg font-extrabold">Samou' Go</p>
        <p className="px-3 text-[11px] text-white/70">الكابتن</p>
        <nav className="mt-8 flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const selected = activeTab === item.id;
            return <button key={item.id} type="button" onClick={() => setActiveTab(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-bold transition ${selected ? 'bg-brand text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
              <Icon size={18} /><span>{item.label}</span>
            </button>;
          })}
        </nav>
        <div className="border-t border-white/10 pt-5">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-sm font-extrabold text-brand-deep">
              {auth.user?.name.slice(0, 2).toUpperCase() ?? 'ك'}
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-[12px]">{auth.user?.name ?? 'الكابتن'}</strong>
              <span className="block truncate text-[11px] text-white/70">سائق / كابتن</span>
            </span>
            <button
              type="button"
              onClick={auth.signOut}
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
              className="ms-auto rounded-lg p-1 text-white/70 transition hover:bg-surface/10 hover:text-white"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <header className="bg-brand px-4 pb-4 pt-3 text-white">
        <nav className="mx-auto flex max-w-md items-center justify-between" aria-label="Captain navigation">
          <button type="button" aria-label="Profile" onClick={() => setActiveTab('account')} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-surface/15 transition hover:bg-surface/25">
            <UserRound size={21} />
          </button>
          <div className="text-center leading-tight">
            <p className="text-[16px] font-extrabold">مرحباً {captainName} 👋</p>
            <p dir="ltr" className="text-[11px] font-medium text-white/85">Hello, {captainName}</p>
          </div>
          <div className="flex items-center gap-2" dir="ltr">
            <LanguageToggle onDark />
            <ThemeToggle onDark />
            <NotificationBell
              notifications={bellNotifications}
              storageKey="captain"
              chimeOnNew={false}
              onDark
              max={10}
            />
            <button
              type="button"
              aria-pressed={available}
              disabled={availabilityMutation.pending}
              onClick={() => void handleToggleAvailability()}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-bold transition disabled:opacity-60 ${
                available ? 'bg-surface text-brand-dark' : 'bg-black/20 text-white'
              }`}
            >
              {availabilityMutation.pending ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <span className={`h-2 w-2 rounded-full ${available ? 'bg-brand' : 'bg-surface/70'}`} />
              )}
              <span dir="rtl">{available ? 'متاح' : 'غير متاح'}</span>
              <span dir="ltr">/ {available ? 'Available' : 'Offline'}</span>
            </button>
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-md px-4">
        {activeTab === 'home' && (
          <>
            {earningsSection}

            {/* Error state */}
            {error && !loading && (
              <section className="mt-5" aria-live="assertive">
                <div className="rounded-2xl border border-danger-tint bg-surface p-5 text-center shadow-card">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
                    <X size={22} />
                  </span>
                  <h2 className="mt-3 text-sm font-extrabold">تعذّر تحميل الطلبات</h2>
                  <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">Could not load orders</p>
                  <p className="mt-2 text-xs text-ink-soft">{error.message}</p>
                  <button
                    type="button"
                    onClick={() => { void availableOrders.refresh(); void activeOrders.refresh(); void completedOrders.refresh(); }}
                    disabled={availableOrders.refreshing || activeOrders.refreshing}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
                  >
                    {availableOrders.refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    إعادة المحاولة <span dir="ltr">Retry</span>
                  </button>
                </div>
              </section>
            )}

            {/* Active deliveries */}
            {activeItems.length > 0 && (
              <section aria-labelledby="active-delivery-title" className="mt-5 rounded-2xl border border-warning-tint bg-surface p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-warning-tint px-2.5 py-1 text-[10px] font-extrabold text-warning-ink">
                    جاري التوصيل <span dir="ltr" className="font-semibold">/ Active</span>
                  </span>
                </div>
                {activeItems.map((order) => {
                  const time = relativeTime(order.createdAt);
                  return (
                    <div key={order.id} className="mt-3 border-t border-line-soft pt-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 id="active-delivery-title" className="text-[15px] font-extrabold">{order.storeNameAr}</h2>
                          <p className="mt-1 text-[11px] text-ink-muted">
                            {time.ar} <span dir="ltr" className="text-ink-subtle">· {time.en}</span>
                          </p>
                        </div>
                        <div className="text-start">
                          <p dir="ltr" className="text-lg font-black text-brand-dark">
                            {FREE_DELIVERY_LABEL.en}
                          </p>
                          <p className="text-[10px] text-ink-muted">{FREE_DELIVERY_LABEL.ar}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-2" aria-label="Delivery status">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-dark">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-tint">
                            <Check size={12} />
                          </span>
                          <span dir="ltr">Picked Up</span>
                        </div>
                        <div className="h-px flex-1 bg-brand-tint" />
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-dark">
                          <span className="h-2 w-2 rounded-full bg-brand ring-4 ring-brand-tint" />
                          <span dir="ltr">On the Way</span>
                        </div>
                      </div>
                      {activeOrderDetail.data?.id === order.id &&
                        (activeOrderDetail.data.orderNote ||
                          activeOrderDetail.data.items.some((item) => item.note)) && (
                          <div className="mt-3 space-y-1.5 rounded-xl bg-brand-surface px-3 py-2 text-[11px] text-ink-soft">
                            {activeOrderDetail.data.orderNote && (
                              <p className="flex items-start gap-1.5 font-semibold text-ink">
                                <StickyNote size={12} className="mt-0.5 shrink-0 text-brand" />
                                <span>{activeOrderDetail.data.orderNote}</span>
                              </p>
                            )}
                            {activeOrderDetail.data.items
                              .filter((item) => item.note)
                              .map((item) => (
                                <p key={item.id} className="flex items-start gap-1.5">
                                  <StickyNote size={12} className="mt-0.5 shrink-0 text-brand" />
                                  <span>
                                    <b className="font-bold text-ink">{item.product.nameAr}</b>: {item.note}
                                  </span>
                                </p>
                              ))}
                          </div>
                        )}
                      <div className="mt-4 flex gap-2">
                        <a
                          href={activeOrderDetail.data?.store ? mapsDirections({
                            latitude: activeOrderDetail.data.store.latitude,
                            longitude: activeOrderDetail.data.store.longitude,
                            label: activeOrderDetail.data.store.nameAr,
                          }) : undefined}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!activeOrderDetail.data?.store}
                          title={`${activeOrderDetail.data?.store.nameEn ?? 'Store'}: Google Maps`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand px-3 py-2.5 text-[10px] font-bold text-brand transition hover:bg-brand-tint"
                        >
                          <StoreIcon size={15} />
                          <span>المتجر</span>
                          <span dir="ltr" className="font-semibold text-brand-dark/70">· Store</span>
                        </a>
                        <a
                          href={activeOrderDetail.data ? mapsDirectionsToAddress(activeOrderDetail.data.customerAddressText) : undefined}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!activeOrderDetail.data}
                          title="Google Maps"
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand px-3 py-2.5 text-[10px] font-bold text-brand transition hover:bg-brand-tint ${activeOrderDetail.data ? '' : 'pointer-events-none opacity-50'}`}
                        >
                          <Navigation size={15} />
                          <span>العميل</span>
                          <span dir="ltr" className="font-semibold text-brand-dark/70">· Customer</span>
                        </a>
                        <button
                          type="button"
                          disabled={deliverMutation.pending}
                          onClick={() => handleDeliver(order.id)}
                          className="flex flex-[1.35] items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-[11px] font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
                        >
                          {deliverMutation.pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          <span>تم التوصيل / Delivered</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {availableOrdersSection}
            {todaySection}
          </>
        )}

        {activeTab === 'orders' && (
          <>{availableOrdersSection}</>
        )}

        {activeTab === 'earnings' && (
          <>
            {earningsSection}
            {todaySection}
          </>
        )}

        {activeTab === 'map' && (
          <section className="mt-6" aria-labelledby="map-title">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 id="map-title" className="text-[17px] font-extrabold">التوجيه إلى المتجر والعميل</h2>
                <p dir="ltr" className="text-[11px] text-ink-muted">Google Maps Navigation</p>
              </div>
            </div>

            {activeItems.length > 0 && activeOrderDetail.data ? (
              <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                {activeOrderDetail.data.store.latitude !== null && activeOrderDetail.data.store.longitude !== null && <LeafletMap center={[activeOrderDetail.data.store.latitude, activeOrderDetail.data.store.longitude]} markers={[{ position: [activeOrderDetail.data.store.latitude, activeOrderDetail.data.store.longitude], label: activeOrderDetail.data.store.nameAr }]} />}
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-warning-tint px-2.5 py-1 text-[10px] font-extrabold text-warning-ink">
                    توصيل جاري <span dir="ltr">/ Active route</span>
                  </span>
                  <p className="text-[11px] font-extrabold">{activeOrderDetail.data.store.nameAr}</p>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3 rounded-xl bg-brand-surface p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <StoreIcon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-extrabold">استلام من المتجر <span dir="ltr" className="text-ink-muted">· Pickup</span></p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted">{activeOrderDetail.data.store.nameAr} — {activeOrderDetail.data.store.nameEn}</p>
                      {activeOrderDetail.data.store.latitude !== null && activeOrderDetail.data.store.longitude !== null ? (
                        <p dir="ltr" className="text-[10px] text-brand-deep">
                          {activeOrderDetail.data.store.latitude.toFixed(5)}, {activeOrderDetail.data.store.longitude.toFixed(5)}
                        </p>
                      ) : (
                        <p className="text-[10px] text-ink-subtle">بدون إحداثيات · no coordinates</p>
                      )}
                      <a
                        href={mapsDirections({
                          latitude: activeOrderDetail.data.store.latitude,
                          longitude: activeOrderDetail.data.store.longitude,
                          label: activeOrderDetail.data.store.nameAr,
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-[11px] font-bold text-brand transition hover:bg-brand-tint"
                      >
                        <Navigation size={14} /> توجيه إلى المتجر <span dir="ltr">· Navigate to store</span>
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl bg-brand-surface p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <MapPin size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-extrabold">إيصال للعميل <span dir="ltr" className="text-ink-muted">· Dropoff</span></p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{activeOrderDetail.data.customerAddressText}</p>
                      <a
                        href={mapsDirectionsToAddress(activeOrderDetail.data.customerAddressText)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-[11px] font-bold text-brand transition hover:bg-brand-tint"
                      >
                        <Navigation size={14} /> توجيه إلى العميل <span dir="ltr">· Navigate to customer</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
                  <MapPin size={22} />
                </span>
                <h3 className="mt-3 text-sm font-extrabold">لا توجد رحلة جارية</h3>
                <p dir="ltr" className="mt-1 text-[11px] text-ink-muted">No active delivery</p>
                <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                  عند قبول طلب سيظهر هنا المسار من المتجر إلى العميل مع أزرار فتح خرائط Google.
                </p>
              </div>
            )}
          </section>
        )}

        {activeTab === 'account' && (
          <CaptainAccountPanel
            user={auth.user}
            pending={profileMutation.pending}
            savingError={profileMutation.error?.message}
            onSave={handleSaveProfile}
            onSignOut={auth.signOut}
          />
        )}
      </div>

      <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-line bg-surface/95 px-2 pb-[max(9px,env(safe-area-inset-bottom))] pt-2 shadow-raised backdrop-blur md:hidden" aria-label="Bottom navigation">
        <div className="mx-auto flex max-w-md items-center justify-around">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex min-w-[52px] flex-col items-center gap-0.5 rounded-xl px-2 py-1 transition ${isActive ? 'text-brand' : 'text-ink-subtle hover:text-ink-soft'}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={19} strokeWidth={isActive ? 2.7 : 1.8} />
                <span className="text-[10px] font-bold">{item.label}</span>
                <span dir="ltr" className="text-[8px] font-normal">{item.english}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

/* ---------------------------------------------------------------------------
 * Account tab — profile editing (PATCH /auth/me) + sign out
 * ------------------------------------------------------------------------- */

interface CaptainAccountPanelProps {
  user: PublicUser;
  pending: boolean;
  savingError?: string;
  onSave: (input: UpdateProfileInput) => Promise<PublicUser | null>;
  onSignOut: () => void;
}

function CaptainAccountPanel({ user, pending, savingError, onSave, onSignOut }: CaptainAccountPanelProps) {
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
    <section className="pt-6" aria-labelledby="account-title">
      <div className="mb-4">
        <h2 id="account-title" className="text-[17px] font-extrabold">حسابي</h2>
        <p dir="ltr" className="text-[11px] text-ink-muted">Account &amp; Profile</p>
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3 border-b border-line-soft pb-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-base font-extrabold text-brand-deep">
              {user.name.slice(0, 2)}
            </span>
            <div>
              <p className="text-sm font-extrabold">{user.name}</p>
              <p className="text-[11px] text-ink-muted" dir="ltr">{user.phone}</p>
            </div>
            <span className="ms-auto rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-bold text-brand-deep">
              {user.isAvailable ? 'متاح · Available' : 'غير متاح · Offline'}
            </span>
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-bold text-ink">الاسم الكامل / Full name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
          </label>

          <label className="mt-3 block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink">
              <Phone size={12} className="text-brand" /> رقم الجوال / Mobile
            </span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className={fieldClass} />
          </label>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="text-xs font-extrabold text-ink">تغيير كلمة المرور <span dir="ltr" className="font-medium text-ink-muted">/ Change password</span></p>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-bold text-ink">كلمة المرور الحالية / Current password</span>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={fieldClass} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-bold text-ink">كلمة مرور جديدة / New password</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={fieldClass} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-bold text-ink">تأكيد كلمة المرور / Confirm password</span>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={fieldClass} />
          </label>
        </div>

        {(localError || savingError) && (
          <p className="flex items-start gap-1.5 rounded-xl bg-danger-tint px-3 py-2 text-xs font-semibold text-danger-ink" role="alert">
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
        تسجيل الخروج <span dir="ltr" className="font-medium text-danger/70">/ Sign out</span>
      </button>
    </section>
  );
}
