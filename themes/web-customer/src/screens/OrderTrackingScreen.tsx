/**
 * `/orders/:orderId` — live order tracking.
 *
 * Polls `GET /orders/:id` every 15 seconds (there is no websocket) via the
 * shared `useOrder` hook, and renders the order through `OrderStatusTimeline`,
 * which is driven by `ORDER_STATUS_SEQUENCE` so the UI cannot drift from the
 * state machine. The captain has no GPS, so the delivery model is: the captain
 * phones the customer when they are close — the address shown here is exactly
 * what the captain sees.
 *
 * Polling halts automatically once the order reaches a terminal state
 * (`DELIVERED` or `CANCELLED`) — there is nothing left to follow, so the
 * screen stops hitting the API until the user leaves.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, Loader2, MapPin, RefreshCw, RotateCw, ShoppingCart, StickyNote } from 'lucide-react';
import { PaymentMethod, OrderStatus } from '@samou-go/shared-types';
import { useAuth } from '@/hooks/useApi';
import { useOrder, useToast, reorderOrder, usePlatformSettings } from '@/hooks/useApi';
import { connectRealtime } from '@samou-go/api-client';
import { LeafletMap } from '@samou-go/ui/map';
import { useCart } from '@/components/CartProvider';
import { CustomerAuthGate } from '@/components/CustomerAuthGate';
import { OrderStatusTimeline } from '@/components/OrderStatusTimeline';
import { PageTransition } from '@/components/PageTransition';
import { Skeleton } from '@/components/Skeleton';
import { formatCurrency, DRIVER_FEE_LABEL, DRIVER_FEE_NOTICE, deliveryFeeLabel } from '@/lib/delivery';
import { useLanguage } from '@samou-go/ui';

const POLL_MS = 15_000;

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar-PS', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function OrderTrackingScreen() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';
  const platformSettings = usePlatformSettings();
  const isDynamicFee = platformSettings.data?.isDriverDynamicFeeEnabled ?? false;
  // Terminal orders have nothing left to follow — `stopWhen` halts the polling.
  const order = useOrder(orderId, {
    pollMs: POLL_MS,
    stopWhen: (o) => o?.status === OrderStatus.DELIVERED || o?.status === OrderStatus.CANCELLED,
  });
  const terminal = order.data?.status === OrderStatus.DELIVERED || order.data?.status === OrderStatus.CANCELLED;
  const cart = useCart();
  const toast = useToast();
  const [reordering, setReordering] = useState(false);
  const [captainLocation, setCaptainLocation] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!orderId) return;
    const socket = connectRealtime();
    socket.emit('order:join', orderId);
    socket.on('captain:location', (location: { lat: number; lng: number }) => setCaptainLocation(location));
    socket.on('order:status_updated', () => void order.refresh());
    return () => { socket.disconnect(); };
  }, [orderId, order.refresh]);

  const handleReorder = async () => {
    if (reordering || !order.data) return;
    setReordering(true);
    try {
      const result = await reorderOrder(order.data.id);
      if (result.items.length === 0) {
        toast.error('لا يمكن إعادة الطلب — كل المنتجات غير متاحة حالياً', 'Nothing left to reorder');
        return;
      }
      result.items.forEach((item) => cart.addItem(item.product, item.quantity, '', result.storeNameAr));
      if (result.skipped > 0) {
        toast.info(
          `أُضيفت ${result.items.length} أصناف. ${result.skipped} منتجات لم تعد متاحة وتم تخطّيها`,
          `Added ${result.items.length} items. Skipped ${result.skipped} unavailable.`
        );
      } else {
        toast.success('أُضيفت الأصناف إلى السلة', 'Items added to your cart');
      }
      navigate('/cart');
    } catch {
      toast.error('تعذّرت إعادة الطلب', 'Could not reorder');
    } finally {
      setReordering(false);
    }
  };

  if (!auth.ready) {
    return (
      <PageTransition>
        <div className="flex min-h-screen items-center justify-center bg-canvas text-ink">
          <Loader2 size={22} className="animate-spin text-brand" />
        </div>
      </PageTransition>
    );
  }

  if (!auth.user) {
    return (
      <PageTransition>
        <CustomerAuthGate
          auth={auth}
          reasonAr="سجّل الدخول لتتبع طلبك"
          reasonEn="Sign in to track your order"
        />
      </PageTransition>
    );
  }

  const cancelled = order.data?.status === OrderStatus.CANCELLED;

  return (
    <PageTransition>
      <main className="min-h-screen bg-canvas pb-16 text-ink">
        <header className="safe-top bg-brand px-5 pb-4 pt-4 text-white">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <button
              type="button"
              aria-label={t('رجوع', 'Back')}
              onClick={() => navigate(-1)}
              className="rounded-full p-2 transition hover:bg-surface/15 active:scale-95"
            >
              <ArrowRight size={22} className="rtl:rotate-180" />
            </button>
            <div className="flex-1 text-end">
              <h1 className="text-lg font-extrabold">{t('تتبع الطلب', 'Order tracking')}</h1>
            </div>
            {order.data && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-micro font-bold">
                {terminal ? (
                  <>
                    <CheckCircle2 size={11} /> {order.data.status === OrderStatus.CANCELLED ? 'ملغي' : 'تم'}
                  </>
                ) : (
                  <>
                    <RotateCw size={11} className="animate-spin" /> حي
                  </>
                )}
              </span>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-md space-y-4 px-5 pt-6">
          {order.loading && !order.data ? (
            <div className="space-y-3">
              <Skeleton className="h-36 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          ) : order.error && !order.data ? (
            <div className="rounded-2xl border border-danger-tint bg-surface p-6 text-center shadow-card">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
                <AlertTriangle size={22} />
              </span>
              <h1 className="mt-4 text-sm font-extrabold">{t('تعذّر تحميل الطلب', 'Could not load the order')}</h1>
              <p className="mt-1 text-xs text-ink-soft">{isArabic ? order.error.message : order.error.localizedMessage}</p>
              <button
                type="button"
                onClick={order.refresh}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white"
              >
                <RefreshCw size={14} /> إعادة المحاولة
              </button>
            </div>
          ) : order.data ? (
            <>
              {/* Timeline */}
              <section className={`rounded-2xl bg-surface p-4 shadow-card ${cancelled ? 'opacity-90' : ''}`}>
                <OrderStatusTimeline status={order.data.status} />
              </section>

              {/* Store + delivery model */}
              <section className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
                  <MapPin size={18} />
                </span>
                <div className="min-w-0 flex-1 text-end">
                  <h2 className="truncate text-sm font-extrabold">{t(order.data.store.nameAr, order.data.store.nameEn)}</h2>
                  <p className="text-[11px] text-ink-muted">{order.data.customerAddressText}</p>
                </div>
              </section>
              {order.data.store.latitude !== null && order.data.store.longitude !== null && <section className="rounded-2xl bg-surface p-2 shadow-card"><LeafletMap center={captainLocation ? [captainLocation.lat, captainLocation.lng] : [order.data.store.latitude, order.data.store.longitude]} markers={[{ position: [order.data.store.latitude, order.data.store.longitude], label: t(order.data.store.nameAr, order.data.store.nameEn) }, ...(captainLocation ? [{ position: [captainLocation.lat, captainLocation.lng] as [number, number], label: t('السائق', 'Captain') }] : [])]} /></section>}

              {/* Items */}
              <section className="rounded-2xl bg-surface p-4 shadow-card">
                <h2 className="text-sm font-extrabold">تفاصيل الطلب</h2>
                <ul className="mt-3 space-y-2.5">
                  {order.data.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3">
                      {item.product.imageUrl ? (
                        <img
                          src={item.product.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-11 w-11 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-xs font-black text-brand-dark">
                          {item.product.nameAr.slice(0, 2)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1 text-end">
                        <p className="truncate text-xs font-bold">{item.product.nameAr}</p>
                        <p className="text-micro text-ink-muted" dir="ltr">
                          {item.quantity} × {formatCurrency(item.unitPrice)}
                        </p>
                        {item.note && (
                          <p className="mt-1 flex items-center gap-1 rounded-lg bg-brand-surface px-2 py-1 text-micro text-ink-soft">
                            <StickyNote size={11} className="shrink-0 text-brand" />
                            <span className="line-clamp-2 text-start">{item.note}</span>
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-extrabold" dir="ltr">
                        {formatCurrency(item.totalPrice)}
                      </span>
                    </li>
                  ))}
                </ul>

                <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                  <div className="flex justify-between text-ink-muted">
                    <dt>المجموع الفرعي</dt>
                    <dd dir="ltr" className="font-bold text-ink">{formatCurrency(order.data.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between text-ink-muted">
                    <dt>{deliveryFeeLabel(language)}</dt>
                    <dd dir="ltr" className="font-bold text-brand-dark">
                      {isDynamicFee
                        ? (isArabic ? DRIVER_FEE_LABEL.ar : DRIVER_FEE_LABEL.en)
                        : formatCurrency(order.data.deliveryFee)}
                    </dd>
                  </div>
                  {!terminal && (
                    <p className="mt-1 text-[10px] text-brand-dark bg-brand-tint rounded px-2 py-1 text-center">
                      {t(DRIVER_FEE_NOTICE.ar, DRIVER_FEE_NOTICE.en)}
                    </p>
                  )}
                  {order.data.discount > 0 && (
                    <div className="flex justify-between text-brand-dark">
                      <dt>{isArabic ? order.data.voucher?.labelAr ?? 'خصم الكوبون' : order.data.voucher?.labelEn ?? 'Voucher discount'}</dt>
                      <dd dir="ltr" className="font-bold">− {formatCurrency(order.data.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 text-sm">
                    <dt className="font-extrabold">الإجمالي</dt>
                    <dd dir="ltr" className="font-extrabold text-brand-dark">{formatCurrency(order.data.totalAmount)}</dd>
                  </div>
                </dl>
              </section>

              {/* Re-order this basket */}
              <section className="rounded-2xl bg-surface p-4 shadow-card">
                <button
                  type="button"
                  onClick={() => void handleReorder()}
                  disabled={reordering}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60"
                >
                  {reordering ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ShoppingCart size={16} />
                  )}
                  {t('إعادة الطلب', 'Reorder')}
                </button>
              </section>

              {/* Payment + address note */}
              <section className="space-y-2">
                <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
                    <Banknote size={16} />
                  </span>
                  <div className="flex-1 text-end">
                    <p className="text-xs font-extrabold">
                      {order.data.paymentMethod === PaymentMethod.COD ? t('الدفع عند الاستلام', 'Cash on delivery') : order.data.paymentMethod}
                    </p>
                  </div>
                </div>
                {order.data.addressNote && (
                  <div className="rounded-2xl bg-surface p-4 text-xs text-ink-soft shadow-card">
                    <span className="font-bold text-ink">ملاحظة العنوان: </span>
                    {order.data.addressNote}
                  </div>
                )}
                {order.data.orderNote && (
                  <div className="rounded-2xl bg-surface p-4 text-xs text-ink-soft shadow-card">
                    <span className="font-bold text-ink">ملاحظة الطلب: </span>
                    {order.data.orderNote}
                  </div>
                )}
              </section>

              {/* Captain note */}
              <section className="rounded-2xl border border-line bg-brand-surface p-4 text-center">
                <p className="text-[11px] leading-relaxed text-ink-soft">
                  {t(
                    'الكابتن سيتصل بك عند وصوله — السائق لا يمتلك إحداثيات GPS.',
                    "The captain will call you on arrival — Samou' has no street GPS."
                  )}
                </p>
              </section>

              {/* Back to home */}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface py-3 text-sm font-bold text-ink transition hover:bg-canvas active:scale-[0.98]"
              >
                {t('العودة للمتاجر', 'Back to home')}
              </button>

              {terminal ? (
                <p className="flex items-center justify-center gap-1.5 pb-4 text-micro text-ink-muted">
                  <CheckCircle2 size={11} /> {t('اكتمل الطلب — لا مزيد من التحديثات', 'Order final — updates stopped')}
                </p>
              ) : (
                <p className="flex items-center justify-center gap-1.5 pb-4 text-micro text-ink-muted">
                  <RotateCw size={11} /> {t('يتحدّث تلقائياً كل 15 ثانية', 'Updates every 15s')}
                </p>
              )}
            </>
          ) : null}
        </div>
      </main>
    </PageTransition>
  );
}
