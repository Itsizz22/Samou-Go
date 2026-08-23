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
  Menu,
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
  Camera,
} from 'lucide-react';
import {
  SignInGate,
  listActiveDeliveryZones,
  setAvailability,
  setOrderDeliveryZone,
  setOrderDeliveryFee,
  updateOrderStatus,
  updateProfile,
  useUploadImage,
  useAuth,
  useMutation,
  useOrder,
  useOrders,
  usePlatformSettings,
  useRoleRedirect,
  useToast,
  useWallet,
  connectRealtime,
} from '@samou-go/api-client';
import {
  Badge,
  LanguageToggle,
  NotificationBell,
  ThemeToggle,
  useLanguage,
  type BellNotification,
} from '@samou-go/ui';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  OrderStatus,
  UserRole,
  canRoleSetOrderStatus,
  canRoleTransitionOrderStatus,
  canTransitionOrderStatus,
  type DeliveryZone,
  type OrderDetail,
  type OrderSummary,
  type PublicUser,
  type UpdateOrderStatusInput,
  type UpdateProfileInput,
  formatWhatsAppLink,
  WHATSAPP_MESSAGES,
} from '@samou-go/shared-types';
import { DRIVER_FEE_LABEL } from '@/lib/delivery';
import { SupportWhatsAppButton } from '@/components/SupportWhatsAppButton';
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

/** Captain's flat earnings per completed delivery, in ILS — read LIVE from the
 * platform settings, not a hard-coded constant. The server credits exactly
 * `deliveryFee + captainDeliveryRate` per delivered order (see
 * `creditDeliveredOrder`); with free delivery that is the rate alone. */

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
  const auth = useAuth({ allowedRoles: [UserRole.CAPTAIN] });
  const toast = useToast();
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';

  // Unified login: non-captain roles are sent to their own workspace.
  useRoleRedirect('captain');

  const [available, setAvailable] = useState<boolean>(auth.user?.isAvailable ?? false);
  const [activeTab, setActiveTab] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  // Dynamic fee modal state
  const [dynamicFeeOrderId, setDynamicFeeOrderId] = useState<string | null>(null);
  const [dynamicFeeValue, setDynamicFeeValue] = useState('');
  const [dynamicFeeLoading, setDynamicFeeLoading] = useState(false);

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

  // The real per-delivery rate from the platform (admin-configured) and the
  // captain's ACTUAL wallet balance — never a hard-coded constant.
  const platformSettings = usePlatformSettings({ enabled: isCaptain });
  const captainRate = platformSettings.data?.captainDeliveryRate ?? 0;
  const wallet = useWallet({ enabled: isCaptain });

  useEffect(() => {
    if (!isCaptain || !activeItems[0]?.id || !navigator.geolocation) return;
    const socket = connectRealtime();
    const orderId = activeItems[0].id;
    const watchId = navigator.geolocation.watchPosition((position) => {
      socket.emit('captain:location', { orderId, lat: position.coords.latitude, lng: position.coords.longitude, heading: position.coords.heading ?? undefined });
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 5_000 });
    return () => { navigator.geolocation.clearWatch(watchId); socket.disconnect(); };
    // Depend on the ORDER ID, not `activeItems`: `availableOrders` re-fetches
    // every 10 s, producing a fresh array reference that would otherwise tear
    // down and rebuild the socket + GPS watch on every poll.
  }, [activeItems[0]?.id, isCaptain]);

  // Load active delivery zones once on mount for the zone picker.
  useEffect(() => {
    listActiveDeliveryZones().then(setZones).catch(() => undefined);
  }, []);

  const completedToday = useMemo(() => {
    const today = new Date().toDateString();
    return (completedOrders.data?.items ?? []).filter((order) => new Date(order.createdAt).toDateString() === today);
  }, [completedOrders.data]);

  const todayDeliveries = completedToday.length;
  const todayCash = useMemo(() => completedToday.reduce((total, order) => total + order.totalAmount, 0), [completedToday]);
  const todayEarnings = useMemo(() => {
    // Each delivered order credits the captain `deliveryFee + captainDeliveryRate`
    // (delivery fees are 0 platform-wide), so today's accrued earnings are
    // exactly the delivered count times the LIVE platform rate.
    return todayDeliveries * captainRate;
  }, [todayDeliveries, captainRate]);

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

  interface TransitionInput { orderId: string; status: OrderStatus; deliveryPin?: string }

  const acceptMutation = useMutation<TransitionInput, OrderDetail>(
    (input, signal) => updateOrderStatus(input.orderId, { status: input.status }, signal)
  );

  const deliverMutation = useMutation<TransitionInput, OrderDetail>(
    (input, signal) => updateOrderStatus(input.orderId, { status: input.status, ...(input.deliveryPin ? { deliveryPin: input.deliveryPin } : {}) }, signal)
  );

  const cancelMutation = useMutation<TransitionInput, OrderDetail>(
    (input, signal) => updateOrderStatus(input.orderId, { status: input.status }, signal)
  );

  const handleAccept = async (orderId: string) => {
    // Check if dynamic fee mode is enabled
    const isDynamicFeeEnabled = platformSettings.data?.isDriverDynamicFeeEnabled;
    if (isDynamicFeeEnabled) {
      // Open the dynamic fee modal instead of directly accepting
      setDynamicFeeOrderId(orderId);
      setDynamicFeeValue('');
      return;
    }
    // Normal acceptance flow
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
        toast.error('تعذّر قبول الطلب', acceptMutation.error.localizedMessage, { duration: 5_000 });
      }
      // Refresh the pool so the claimed order disappears immediately.
      void availableOrders.reload();
    }
  };

  const handleDynamicFeeAccept = async () => {
    if (!dynamicFeeOrderId || dynamicFeeLoading) return;
    const fee = Number(dynamicFeeValue);
    if (!Number.isFinite(fee) || fee < 0 || fee > 1000) {
      toast.error('أدخل رسوم توصيل صحيحة بين 0 و 1000 ₪', 'Enter a valid delivery fee between 0 and 1000 ₪');
      return;
    }
    setDynamicFeeLoading(true);
    try {
      // First set the delivery fee
      await setOrderDeliveryFee(dynamicFeeOrderId, fee);
      // Then accept the order
      const result = await acceptMutation.run({ orderId: dynamicFeeOrderId, status: OrderStatus.ON_THE_WAY });
      if (result) {
        toast.success('تم استلام الطلب للتوصيل', 'Order picked up — heading to the customer');
        void availableOrders.reload();
        void activeOrders.reload();
      } else if (acceptMutation.error) {
        if (acceptMutation.error.status === 409) {
          toast.error('سبقك كابتن آخر إلى هذا الطلب', 'Another captain just claimed this order');
        } else {
          toast.error('تعذّر قبول الطلب', acceptMutation.error.localizedMessage, { duration: 5_000 });
        }
        void availableOrders.reload();
      }
    } catch (err) {
      toast.error('تعذّر تحديد الرسوم', err instanceof Error ? err.message : 'Failed to set fee');
    } finally {
      setDynamicFeeLoading(false);
      setDynamicFeeOrderId(null);
      setDynamicFeeValue('');
    }
  };

  const [pinModalOrderId, setPinModalOrderId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');

  const handleDeliver = async (orderId: string, pin: string) => {
    const result = await deliverMutation.run({ orderId, status: OrderStatus.DELIVERED, deliveryPin: pin });
    if (result) {
      toast.success('تم توصيل الطلب بنجاح', 'Order delivered successfully');
    } else if (deliverMutation.error) {
      toast.error('تعذّر تأكيد التوصيل', deliverMutation.error.localizedMessage, { duration: 5_000 });
    }
    void activeOrders.reload();
    void completedOrders.reload();
  };

  // A captain may cancel a ready order already assigned to them (server gate:
  // READY_FOR_PICKUP → CANCELLED, ownership enforced server-side). Once the
  // trip starts (ON_THE_WAY) the cancel window is closed.
  const handleCancel = async (orderId: string) => {
    const result = await cancelMutation.run({ orderId, status: OrderStatus.CANCELLED });
    if (result) {
      toast.success('تم إلغاء الطلب', 'Order cancelled');
    } else if (cancelMutation.error) {
      toast.error('تعذّر إلغاء الطلب', cancelMutation.error.localizedMessage, { duration: 5_000 });
    }
    void availableOrders.reload();
    void activeOrders.reload();
  };

  // Sets the delivery zone for one order. Returns `true` on success so the
  // picker can clear its local selection; the fee is derived server-side from
  // the zone row — the captain never sends an amount.
  const handleZoneSet = async (orderId: string, zoneId: string): Promise<boolean> => {
    try {
      await setOrderDeliveryZone(orderId, zoneId);
      toast.success('تم تحديد منطقة التوصيل', 'Delivery zone set');
      void activeOrders.reload();
      return true;
    } catch {
      toast.error('تعذّر تحديد المنطقة', 'Failed to set zone');
      return false;
    }
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
      toast.error('تعذّر تحديث حالتك', availabilityMutation.error.localizedMessage, { duration: 5_000 });
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
      toast.error('تعذّر تحديث الملف', profileMutation.error.localizedMessage, { duration: 5_000 });
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
          caption: `${time.ar} · ${DRIVER_FEE_LABEL.ar}`,
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
          <div className="skeleton h-32 rounded-2xl shadow-card" />
          <div className="skeleton h-40 rounded-2xl shadow-card" />
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
          <p className="text-[12px] font-semibold text-white/85">{t('أرباح اليوم', "Today's Earnings")}</p>
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
          {t(`${todayDeliveries} توصيلات`, `${todayDeliveries} Deliveries`)}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/20 pt-3 text-[11px]">
        <span>
          <span className="text-white/70">{t('النقد المحصّل', 'Cash')}</span>
          <b dir="ltr" className="block mt-1 text-base">₪{todayCash.toFixed(2)}</b>
        </span>
        <span>
          <span className="text-white/70">{t('أرباحك', 'Your fee')}</span>
          <b dir="ltr" className="block mt-1 text-base">₪{todayEarnings.toFixed(2)}</b>
        </span>
        <span>
          <span className="text-white/70">{t('المحفظة', 'Wallet')}</span>
          <b dir="ltr" className="block mt-1 text-base">₪{(wallet.data?.balance ?? 0).toFixed(2)}</b>
        </span>
      </div>
      {captainRate > 0 && (
        <p className="mt-2 text-[10px] text-white/60">
          {t(`الرسوم: ₪${captainRate} لكل توصيل`, `Rate: ₪${captainRate} per delivery`)}
        </p>
      )}
    </section>
  );

  const availableOrdersSection = (
    <section aria-labelledby="orders-title" className="mt-6">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 id="orders-title" className="text-[17px] font-extrabold">
            {t('طلبات متاحة', 'Available Orders')} <span className="me-1 text-brand">{availableItems.length}</span>
          </h2>
        </div>
      </div>

      <div className="space-y-3">
        {loading && availableItems.length === 0
          ? [0, 1].map((index) => (
              <div key={index} className="skeleton h-32 rounded-2xl shadow-card" aria-hidden="true" />
            ))
          : error && availableItems.length === 0
            ? (
              <div className="rounded-2xl border border-danger-tint bg-surface p-6 text-center shadow-card" role="alert" aria-live="assertive">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
                  <AlertTriangle size={22} />
                </span>
                <h3 className="mt-3 text-sm font-extrabold">{t('تعذّر تحميل الطلبات', 'Could not load orders')}</h3>
                <p className="mt-2 text-xs text-ink-soft">{isArabic ? error.message : error.localizedMessage}</p>
                <button
                  type="button"
                  onClick={() => { void availableOrders.refresh(); void activeOrders.refresh(); void completedOrders.refresh(); }}
                  disabled={availableOrders.refreshing || activeOrders.refreshing}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                >
                  {availableOrders.refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {t('إعادة المحاولة', 'Retry')}
                </button>
              </div>
            )
            : availableItems.length === 0
            ? (
              <div className="rounded-2xl bg-surface p-6 text-center shadow-card">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
                  <Package size={22} />
                </span>
                <h3 className="mt-3 text-sm font-extrabold">{t('لا توجد طلبات متاحة', 'No available orders')}</h3>
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
                          {t(time.ar, time.en)}
                        </p>
                      </div>
                      <span className="rounded-lg bg-brand-tint px-2.5 py-1 text-[12px] font-black text-brand-dark">
                        {t(DRIVER_FEE_LABEL.ar, DRIVER_FEE_LABEL.en)}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted">
                      <Badge tone={ORDER_STATUS_TONES[order.status]} dot>
                        {t(ORDER_STATUS_LABELS[order.status].ar, ORDER_STATUS_LABELS[order.status].en)}
                      </Badge>
                      <span>{order.itemCount} items</span>
                    </div>
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
                    {canTransitionOrderStatus(order.status, OrderStatus.ON_THE_WAY) &&
                      canRoleSetOrderStatus(UserRole.CAPTAIN, OrderStatus.ON_THE_WAY) && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAccept(order.id)}
                          disabled={acceptMutation.pending}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-[11px] font-extrabold text-white transition hover:bg-brand-dark disabled:opacity-60"
                        >
                          {acceptMutation.pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          <span>{t('قبول', 'Accept')}</span>
                        </button>
                        {order.captainId === auth.user?.id &&
                          canRoleTransitionOrderStatus(UserRole.CAPTAIN, order.status, OrderStatus.CANCELLED) && (
                          <button
                            type="button"
                            disabled={cancelMutation.pending}
                            onClick={() => {
                              if (window.confirm(t('إلغاء هذا الطلب؟', 'Cancel this order?'))) {
                                void handleCancel(order.id);
                              }
                            }}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-danger/30 py-2.5 text-[11px] font-bold text-danger-ink transition hover:bg-danger-tint disabled:opacity-60"
                          >
                            <X size={14} />
                            <span>{t('إلغاء', 'Cancel')}</span>
                          </button>
                        )}
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
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-[11px] font-bold text-ink-muted transition hover:bg-brand-surface"
                          aria-label="Ignore order"
                        >
                          <X size={14} />
                          <span>{t('تجاهل', 'Ignore')}</span>
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
        <h2 id="today-title" className="text-[17px] font-extrabold">{t('توصيلات اليوم', "Today's Deliveries")}</h2>
      </div>
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        {completedOrders.loading ? (
          <div className="px-4 py-5 text-center">
            <Loader2 size={16} className="mx-auto animate-spin text-brand" />
          </div>
        ) : completedOrders.error ? (
          <div className="flex items-center justify-center gap-2 px-4 py-5 text-center">
            <p className="text-[12px] text-danger-ink">{isArabic ? completedOrders.error.message : completedOrders.error.localizedMessage}</p>
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
            {t('لا توجد توصيلات مكتملة اليوم', 'No deliveries today')}
          </div>
        ) : (
          <div className="px-4 py-5 text-center">
            <p className="text-sm font-extrabold text-ink">{t(`${todayDeliveries} توصيلات مكتملة`, `${todayDeliveries} deliveries completed`)}</p>
          </div>
        )}
      </div>
    </section>
  );

  /* ---- Render ------------------------------------------------------------ */

  return (
    <main className={`min-h-screen bg-canvas pb-24 font-sans text-ink transition-[padding] duration-300 ${sidebarOpen ? 'md:pr-60' : ''}`}>
      {sidebarOpen && <button type="button" aria-label={t('إغلاق القائمة', 'Close navigation')} onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-20 bg-ink/40 md:hidden" />}
      <aside className={`fixed inset-y-0 right-0 z-30 flex w-60 flex-col bg-brand-deep px-4 py-6 text-white shadow-overlay transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`} aria-label={t('تنقل الكابتن', 'Captain navigation')}>
        <p className="px-3 text-lg font-extrabold">Samou' Go</p>
        <p className="px-3 text-[11px] text-white/70">الكابتن</p>
        <nav className="mt-8 flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const selected = activeTab === item.id;
            return <button key={item.id} type="button" onClick={() => setActiveTab(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-bold transition-all duration-200 ${selected ? 'bg-brand text-white shadow-brand' : 'text-white/75 hover:bg-white/10 hover:text-white active:scale-[0.97]'}`}>
              <Icon size={18} /><span>{t(item.label, item.english)}</span>
            </button>;
          })}
        </nav>
        <div className="border-t border-white/10 pt-5">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-tint text-sm font-extrabold text-brand-deep">
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
              className="ms-auto rounded-lg p-2 text-white/70 transition hover:bg-surface/10 hover:text-white"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
        <button type="button" onClick={() => setSidebarOpen(false)} aria-label={t('إغلاق القائمة', 'Close navigation')} className="absolute start-3 top-3 rounded-lg p-2 text-white/80 hover:bg-white/10 md:hidden"><X size={18} /></button>
      </aside>
      <header className="bg-brand px-4 pb-4 pt-3 text-white">
        <nav className="mx-auto flex max-w-md items-center justify-between" aria-label="Captain navigation">
          <button type="button" onClick={() => setSidebarOpen(value => !value)} aria-expanded={sidebarOpen} aria-label={t('فتح القائمة', 'Open navigation')} className="rounded-lg p-2 text-white transition hover:bg-white/10 active:scale-95"><Menu size={21} /></button>
          <button type="button" aria-label="Profile" onClick={() => setActiveTab('account')} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-surface/15 transition hover:bg-surface/25">
            {auth.user.profileImageUrl ? <img src={auth.user.profileImageUrl} alt={auth.user.name} className="h-full w-full object-cover" /> : <UserRound size={21} />}
          </button>
          <div className="text-center leading-tight">
            <p className="text-[16px] font-extrabold">{t(`مرحباً ${captainName} 👋`, `Hello, ${captainName}`)}</p>
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
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-micro font-bold transition disabled:opacity-60 ${
                available ? 'bg-surface text-brand-dark' : 'bg-black/20 text-white'
              }`}
            >
              {availabilityMutation.pending ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <span className={`h-2 w-2 rounded-full ${available ? 'bg-brand' : 'bg-surface/70'}`} />
              )}
              {t(available ? 'متاح' : 'غير متاح', available ? 'Available' : 'Offline')}
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
                  <h2 className="mt-3 text-sm font-extrabold">{t('تعذّر تحميل الطلبات', 'Could not load orders')}</h2>
                  <p className="mt-2 text-xs text-ink-soft">{isArabic ? error.message : error.localizedMessage}</p>
                  <button
                    type="button"
                    onClick={() => { void availableOrders.refresh(); void activeOrders.refresh(); void completedOrders.refresh(); }}
                    disabled={availableOrders.refreshing || activeOrders.refreshing}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
                  >
                    {availableOrders.refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {t('إعادة المحاولة', 'Retry')}
                  </button>
                </div>
              </section>
            )}

            {/* Active deliveries */}
            {activeItems.length > 0 && (
              <section aria-labelledby="active-delivery-title" className="mt-5 rounded-2xl border border-warning-tint bg-surface p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-warning-tint px-2.5 py-1 text-micro font-extrabold text-warning-ink">
                    {t('جاري التوصيل', 'Active')}
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
                            {t(time.ar, time.en)}
                          </p>
                        </div>
                        <div className="text-start">
                          <p className="text-lg font-black text-brand-dark">
                            {t(DRIVER_FEE_LABEL.ar, DRIVER_FEE_LABEL.en)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-2" aria-label="Delivery status">
                        <div className="flex items-center gap-1.5 text-micro font-bold text-brand-dark">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-tint">
                            <Check size={12} />
                          </span>
                          <span dir="ltr">Picked Up</span>
                        </div>
                        <div className="h-px flex-1 bg-brand-tint" />
                        <div className="flex items-center gap-1.5 text-micro font-bold text-brand-dark">
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
                      {/* Delivery zone picker */}
                      {zones.length > 0 && (
                        <OrderZonePicker
                          zones={zones}
                          orderId={order.id}
                          currentZoneId={
                            activeOrderDetail.data?.id === order.id
                              ? activeOrderDetail.data.deliveryZone?.id ?? null
                              : null
                          }
                          onSet={handleZoneSet}
                        />
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
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand px-3 py-2.5 text-micro font-bold text-brand transition hover:bg-brand-tint"
                        >
                          <StoreIcon size={15} />
                          <span>{t('المتجر', 'Store')}</span>
                        </a>
                        <a
                          href={activeOrderDetail.data ? mapsDirectionsToAddress(activeOrderDetail.data.customerAddressText) : undefined}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!activeOrderDetail.data}
                          title="Google Maps"
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand px-3 py-2.5 text-micro font-bold text-brand transition hover:bg-brand-tint ${activeOrderDetail.data ? '' : 'pointer-events-none opacity-50'}`}
                        >
                          <Navigation size={15} />
                          <span>{t('العميل', 'Customer')}</span>
                        </a>
                        {activeOrderDetail.data?.customer?.phone && (
                          <a
                            href={formatWhatsAppLink(
                              activeOrderDetail.data.customer.phone,
                              WHATSAPP_MESSAGES.captain(order.orderNumber, activeOrderDetail.data.customer.name)
                            )}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t('تواصل عبر واتساب', 'Contact via WhatsApp')}
                            title={t('تواصل عبر واتساب', 'Contact via WhatsApp')}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] py-2.5 text-[11px] font-bold text-white transition hover:bg-[#1ea952] active:scale-95"
                            style={{ backgroundColor: '#25D366' }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.67m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378 3.094 3.094 0 01-.988-.77 9.86 9.86 0 004.776-5.684 3.072 3.072 0 011.228-.378c1.613 0 2.612 1.228 2.612 2.944 0 1.85-1.54 3.325-3.328 3.724-.34.074-.68.148-1.02.222-.34.074-.567.075-.827-.074-.26-.148-.774-.865-1.077-1.488-.302-.622-.373-1.1-.074-1.328s.722-.148 1.095-.074c.373.075.68.3 1.02.623.623.56 1.096 1.592 1.314 2.56.183.78.173 1.558.048 2.068-.099.404-.404.828-.758 1.096-.353.267-.827.374-1.327.312-.488-.062-.948-.136-1.267-.375l-.57-.373c-.43-.238-.675-.286-1.12-.173-.352.123-1.121.375-1.582.81-.507.475-1.53 1.146-1.53 2.104 0 1.137.985 2.14 2.17 2.357.267.049.52.049.804.049.373 0 .747-.099 1.095-.272.34-.173.64-.397.89-.748.267-.373.39-.85.323-1.096-.074-.26-.468-.436-.967-.623-.373-.148-.847-.148-1.24-.074-.622.075-1.106.507-1.342 1.137-.21.576-.21 1.127-.105 1.274.105.15.423.624 1.096 1.517.788.975 2.03 2.18 2.03 3.558 0 2.374-2.778 2.374-2.778 2.914" />
                            </svg>
                            <span>{t('واتساب', 'WhatsApp')}</span>
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={deliverMutation.pending}
                          onClick={() => { setPinModalOrderId(order.id); setPinInput(''); }}
                          className="flex flex-[1.35] items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-[11px] font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
                        >
                          {deliverMutation.pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          <span>{t('تم التوصيل', 'Delivered')}</span>
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
                <h2 id="map-title" className="text-[17px] font-extrabold">{t('التوجيه إلى المتجر والعميل', 'Google Maps Navigation')}</h2>
              </div>
            </div>

            {activeItems.length > 0 && activeOrderDetail.data ? (
              <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                {activeOrderDetail.data.store.latitude !== null && activeOrderDetail.data.store.longitude !== null && <LeafletMap center={[activeOrderDetail.data.store.latitude, activeOrderDetail.data.store.longitude]} markers={[{ position: [activeOrderDetail.data.store.latitude, activeOrderDetail.data.store.longitude], label: activeOrderDetail.data.store.nameAr }]} />}
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-warning-tint px-2.5 py-1 text-micro font-extrabold text-warning-ink">
                    {t('توصيل جاري', 'Active route')}
                  </span>
                  <p className="text-[11px] font-extrabold">{activeOrderDetail.data.store.nameAr}</p>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3 rounded-xl bg-brand-surface p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <StoreIcon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-extrabold">{t('استلام من المتجر', 'Pickup')}</p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted">{activeOrderDetail.data.store.nameAr} — {activeOrderDetail.data.store.nameEn}</p>
                      {activeOrderDetail.data.store.latitude !== null && activeOrderDetail.data.store.longitude !== null ? (
                        <p dir="ltr" className="text-micro text-brand-deep">
                          {activeOrderDetail.data.store.latitude.toFixed(5)}, {activeOrderDetail.data.store.longitude.toFixed(5)}
                        </p>
                      ) : (
                        <p className="text-micro text-ink-muted">{t('بدون إحداثيات', 'no coordinates')}</p>
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
                        <Navigation size={14} /> {t('توجيه إلى المتجر', 'Navigate to store')}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl bg-brand-surface p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <MapPin size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-extrabold">{t('إيصال للعميل', 'Dropoff')}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{activeOrderDetail.data.customerAddressText}</p>
                      <a
                        href={mapsDirectionsToAddress(activeOrderDetail.data.customerAddressText)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-[11px] font-bold text-brand transition hover:bg-brand-tint"
                      >
                        <Navigation size={14} /> {t('توجيه إلى العميل', 'Navigate to customer')}
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
                <h3 className="mt-3 text-sm font-extrabold">{t('لا توجد رحلة جارية', 'No active delivery')}</h3>
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
            savingError={profileMutation.error ? (isArabic ? profileMutation.error.message : profileMutation.error.localizedMessage) : undefined}
            onSave={handleSaveProfile}
            onAvatarChange={(url) => auth.setUser({ ...auth.user!, profileImageUrl: url })}
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
                className={`flex min-w-[52px] flex-col items-center gap-0.5 rounded-xl px-2 py-1 transition ${isActive ? 'text-brand' : 'text-ink-muted hover:text-ink-soft'}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={19} strokeWidth={isActive ? 2.7 : 1.8} />
                <span className="text-micro font-bold">{t(item.label, item.english)}</span>
              </button>
            );
          })}
        </div>
      </nav>
      {/* Delivery PIN modal */}
      {pinModalOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-5">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-raised">
            <h3 className="text-center text-sm font-extrabold">{t('أدخل رمز التوصيل', 'Enter delivery PIN')}</h3>
            <p className="mt-1 text-center text-[11px] text-ink-muted">
              {t('اطلب الرمز من العميل', 'Ask the customer for the code')}
            </p>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="mx-auto mt-4 block w-32 rounded-xl border border-line bg-canvas py-3 text-center text-2xl font-black tracking-[0.3em] text-ink outline-none focus:border-brand"
              placeholder="----"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setPinModalOrderId(null); setPinInput(''); }}
                className="rounded-xl border border-line py-2.5 text-xs font-bold text-ink-soft transition hover:bg-canvas"
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={pinInput.length !== 4 || deliverMutation.pending}
                onClick={() => { void handleDeliver(pinModalOrderId, pinInput); setPinModalOrderId(null); setPinInput(''); }}
                className="rounded-xl bg-brand py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                {deliverMutation.pending ? <Loader2 size={14} className="mx-auto animate-spin" /> : t('تأكيد التسليم', 'Confirm delivery')}
              </button>
            </div>
          </div>
        </div>
      )}
      <SupportWhatsAppButton />
      {/* Dynamic Fee Modal */}
      {dynamicFeeOrderId && (
        <DynamicFeeModal
          isOpen={!!dynamicFeeOrderId}
          onClose={() => {
            setDynamicFeeOrderId(null);
            setDynamicFeeValue('');
          }}
          onConfirm={handleDynamicFeeAccept}
          loading={dynamicFeeLoading}
        />
      )}
    </main>
  );
}

/* ---------------------------------------------------------------------------
 * Delivery zone picker — the captain picks the ZONE; the fee is derived
 * server-side from the admin-configured zone row. Per-order local state so
 * two active orders never share a selection.
 * ------------------------------------------------------------------------- */

interface OrderZonePickerProps {
  zones: DeliveryZone[];
  orderId: string;
  /** The zone already chosen for this order, when known (order detail loaded). */
  currentZoneId: string | null;
  onSet: (orderId: string, zoneId: string) => Promise<boolean>;
}

function OrderZonePicker({ zones, orderId, currentZoneId, onSet }: OrderZonePickerProps) {
  const { t } = useLanguage();
  const [value, setValue] = useState(currentZoneId ?? '');
  const [busy, setBusy] = useState(false);
  const [justSet, setJustSet] = useState(false);

  // When the server detail catches up (after a reload) and reports a zone for
  // this order, reflect it so the dropdown never drifts from the truth.
  useEffect(() => {
    if (currentZoneId !== null) setValue(currentZoneId);
  }, [currentZoneId]);

  const currentZone = zones.find(zone => zone.id === currentZoneId);
  const unchanged = value !== '' && value === currentZoneId;

  const submit = async () => {
    if (!value || busy) return;
    setBusy(true);
    setJustSet(false);
    const ok = await onSet(orderId, value);
    setBusy(false);
    if (ok) {
      setJustSet(true);
      // Keep the selection visible (it is now the order's zone); a future
      // reload with `currentZoneId` will re-sync it and disable the button.
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
      <p className="mb-2 text-micro font-bold text-ink">
        <MapPin size={11} className="me-1 inline text-brand" />
        {t('منطقة التوصيل', 'Delivery zone')}
      </p>
      {currentZone && !justSet && (
        <p className="mb-2 rounded-lg bg-brand-tint px-2.5 py-1.5 text-micro font-semibold text-brand-deep">
          {t('المنطقة الحالية:', 'Current zone:')}{' '}
          {t(currentZone.nameAr, currentZone.nameEn)} — {currentZone.fee} ₪
        </p>
      )}
      <div className="flex gap-2">
        <select
          value={value}
          onChange={event => {
            setValue(event.target.value);
            setJustSet(false);
          }}
          className="flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          aria-label={t('اختر منطقة التوصيل', 'Select delivery zone')}
        >
          <option value="">{t('اختر المنطقة…', 'Choose zone…')}</option>
          {zones.map(zone => (
            <option key={zone.id} value={zone.id}>
              {t(zone.nameAr, zone.nameEn)} — {zone.fee} ₪
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!value || unchanged || busy}
          onClick={() => void submit()}
          className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {t('تأكيد', 'Set')}
        </button>
      </div>
      {justSet && (
        <p className="mt-2 text-micro font-semibold text-brand-dark">
          {t('تم تحديد المنطقة ✓', 'Zone set ✓')}
        </p>
      )}
    </div>
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
  onAvatarChange: (url: string) => void;
  onSignOut: () => void;
}

function CaptainAccountPanel({ user, pending, savingError, onSave, onAvatarChange, onSignOut }: CaptainAccountPanelProps) {
  const { t } = useLanguage();
  const upload = useUploadImage();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const chooseAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      setLocalError(t('اختر صورة أقل من 8 ميغابايت', 'Choose an image under 8 MB'));
      return;
    }
    const result = await upload.run({ kind: 'user', file });
    if (result) onAvatarChange(result.url);
    else setLocalError(upload.error?.localizedMessage ?? t('تعذّر رفع الصورة', 'Could not upload image'));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    const changed = name.trim() !== user.name || phone.trim() !== user.phone;
    if (!changed && !newPassword) {
      setLocalError(t('لم تتغيّر أي بيانات', 'Nothing to update'));
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setLocalError(t('كلمتا المرور غير متطابقتين', 'Passwords do not match'));
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
        <h2 id="account-title" className="text-[17px] font-extrabold">{t('حسابي', 'Account & Profile')}</h2>
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3 border-b border-line-soft pb-3">
            <label className="relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-brand-tint text-base font-extrabold text-brand-deep ring-2 ring-brand/20 transition hover:ring-brand/50">
              {user.profileImageUrl ? <img src={user.profileImageUrl} alt={user.name} className="h-full w-full object-cover" /> : user.name.slice(0, 2)}
              <span className="absolute inset-x-0 bottom-0 flex justify-center bg-ink/60 py-1 text-white"><Camera size={12} /></span>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void chooseAvatar(event.target.files?.[0])} />
            </label>
            <div>
              <p className="text-sm font-extrabold">{user.name}</p>
              <p className="text-[11px] text-ink-muted" dir="ltr">{user.phone}</p>
            </div>
            <span className="ms-auto rounded-full bg-brand-tint px-2.5 py-1 text-micro font-bold text-brand-deep">
              {user.isAvailable ? t('متاح', 'Available') : t('غير متاح', 'Offline')}
            </span>
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-bold text-ink">{t('الاسم الكامل', 'Full name')}</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
          </label>

          <label className="mt-3 block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink">
              <Phone size={12} className="text-brand" /> {t('رقم الجوال', 'Mobile')}
            </span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className={fieldClass} />
          </label>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="text-xs font-extrabold text-ink">{t('تغيير كلمة المرور', 'Change password')}</p>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-bold text-ink">{t('كلمة المرور الحالية', 'Current password')}</span>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={fieldClass} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-bold text-ink">{t('كلمة مرور جديدة', 'New password')}</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={fieldClass} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-bold text-ink">{t('تأكيد كلمة المرور', 'Confirm password')}</span>
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
          {saved ? t('تم الحفظ ✓', 'Saved') : t('حفظ التغييرات', 'Save changes')}
        </button>
      </form>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-danger-tint py-3 text-sm font-bold text-danger transition hover:bg-danger-tint"
      >
        {t('تسجيل الخروج', 'Sign out')}
      </button>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Dynamic Fee Modal — shown when accepting an order with dynamic fee mode enabled
 * ------------------------------------------------------------------------- */
function DynamicFeeModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const { t } = useLanguage();
  const [feeValue, setFeeValue] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    const fee = Number(feeValue);
    if (!Number.isFinite(fee) || fee < 0 || fee > 1000) return;
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="dynamic-fee-title">
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl animate-in fade-in zoom-in-95">
        <h2 id="dynamic-fee-title" className="text-lg font-extrabold text-center">
          {t('تحديد رسوم التوصيل', 'Set Delivery Fee')}
        </h2>
        <p className="mt-2 text-center text-sm text-ink-muted">
          {t('أدخل رسوم التوصيل لهذا الطلب (بالشيكل)', 'Enter the delivery fee for this order (in ILS)')}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <label className="flex-1">
            <input
              type="number"
              value={feeValue}
              onChange={(e) => setFeeValue(e.target.value)}
              min={0}
              max={1000}
              step={0.5}
              inputMode="decimal"
              dir="ltr"
              className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-center text-2xl font-bold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="0.00"
              disabled={loading}
              autoFocus
            />
          </label>
          <span className="text-xl font-bold text-brand-dark self-center">₪</span>
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-muted">
          {t('الحد الأقصى 1000 ₪', 'Maximum 1000 ₪')}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-line bg-surface py-2.5 text-sm font-bold text-ink transition hover:bg-canvas disabled:opacity-60"
          >
            {t('إلغاء', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !Number.isFinite(Number(feeValue)) || Number(feeValue) < 0 || Number(feeValue) > 1000}
            className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                <span>{t('جاري الحفظ…', 'Saving…')}</span>
              </span>
            ) : (
              t('تأكيد', 'Confirm')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
