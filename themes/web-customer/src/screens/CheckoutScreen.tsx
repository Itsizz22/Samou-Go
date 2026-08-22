/**
 * `/checkout` — address + payment + live server quote, then order placement.
 *
 * Client never sends money: the quote (`quoteOrder`) and the order itself
 * (`createOrder`) are priced by the server from DB prices. The form validates
 * everything client-side before submitting (address non-empty, basket present).
 * Payment is cash-on-delivery — the schema's only method, by design.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  CreditCard,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Save,
  Store as StoreIcon,
  Ticket,
} from 'lucide-react';
import type { ApiError } from '@samou-go/api-client';
import { createOrder, checkoutOrders, quoteOrder, getPlatformSettings } from '@/hooks/useApi';
import { OrderSuccess, Button, useLanguage } from '@samou-go/ui';
import { useCart } from '@/components/CartProvider';
import { MapPicker } from '@/components/MapPicker';
import { CustomerAuthGate } from '@/components/CustomerAuthGate';
import { useAuth } from '@/hooks/useApi';
import { formatCurrency, DRIVER_FEE_LABEL, DRIVER_FEE_NOTICE, deliveryFeeLabel } from '@/lib/delivery';
import { hapticError, hapticSuccess } from '@/lib/haptics';
import {
  ADDRESS_TAGS,
  ADDRESS_TAG_META,
  normalizeTag,
  readSavedAddresses,
  upsertAddress,
  writeSavedAddresses,
  type AddressTag,
  type SavedAddress,
} from '@/lib/address-book';
import { PageTransition } from '@/components/PageTransition';
import type { DeliveryRegion, OrderDetail } from '@samou-go/shared-types';
import type { CheckoutResult } from '@samou-go/api-client';

/**
 * Server codes that mean "the basket you are looking at is no longer current" —
 * a product ran out, the store closed, a voucher was fully redeemed. These are
 * expected after a double-tap or a slow network, so the checkout re-quotes
 * (fresh prices) instead of asking the customer to guess what changed.
 */
const STALE_BASKET_CODES = new Set([
  'PRODUCT_UNAVAILABLE',
  'PRODUCT_NOT_IN_STORE',
  'STORE_CLOSED',
  'EMPTY_BASKET',
  'VOUCHER_NOT_FOUND',
  'VOUCHER_INACTIVE',
  'VOUCHER_EXPIRED',
  'VOUCHER_USAGE_LIMIT',
  'VOUCHER_MIN_SUBTOTAL',
  'VOUCHER_NOT_STARTED',
]);

export function CheckoutScreen() {
  const auth = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';

  const [saved, setSaved] = useState<SavedAddress[]>(() => readSavedAddresses());
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressText, setAddressText] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const [deliveryRegion, setDeliveryRegion] = useState<DeliveryRegion>('central');
  const [orderNote, setOrderNote] = useState('');
  const [saveForNextTime, setSaveForNextTime] = useState(true);
  /** Home / Work / Other — persisted with the saved address, shown as a chip. */
  const [addressTag, setAddressTag] = useState<AddressTag>('home');
  /** Map picker state */
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickedLat, setPickedLat] = useState<number | undefined>(undefined);
  const [pickedLng, setPickedLng] = useState<number | undefined>(undefined);
  /** Delivery preset: call on arrival / leave at door */
  const [deliveryPreset, setDeliveryPreset] = useState<string>('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{
    subtotal: number;
    deliveryFee: number;
    discount: number;
    voucherLabelAr: string;
    voucherLabelEn: string;
    totalAmount: number;
  } | null>(null);
  const [quoteError, setQuoteError] = useState<ApiError | null>(null);
  const [quotePending, setQuotePending] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState('');
  const [placing, setPlacing] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  /** The order just created — when set, the form gives way to the success scene. */
  const [placedOrder, setPlacedOrder] = useState<OrderDetail | null>(null);
  /** Multi-store checkout result — when set, renders the grouped success view. */
  const [placedCheckout, setPlacedCheckout] = useState<CheckoutResult | null>(null);
  /** Re-fetches the live quote — bumped when a stale-basket error is caught. */
  const [quoteRevision, setQuoteRevision] = useState(0);
  /** Platform settings — used to check if dynamic driver fee is enabled. */
  const [platformSettings, setPlatformSettings] = useState<{ isDriverDynamicFeeEnabled: boolean } | null>(null);
  /**
   * Belt-and-suspenders against double-submit. The button is also disabled
   * while `placing`, but `disabled` cannot protect against two rapid taps that
   * both enter `handleSubmit` before the re-render lands.
   */
  const submittingRef = useRef(false);

  const items = useMemo(
    () => cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, ...(line.note.trim() ? { note: line.note.trim() } : {}) })),
    [cart.lines]
  );

  // Pick a default saved address once the book loads.
  useEffect(() => {
    if (saved.length > 0 && !selectedAddressId) {
      setSelectedAddressId(saved[0].id);
      if (saved[0].tag) setAddressTag(normalizeTag(saved[0].tag));
      if (saved[0].lat && saved[0].lng) {
        setPickedLat(saved[0].lat);
        setPickedLng(saved[0].lng);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.length]);

  // Fetch platform settings to check if dynamic driver fee is enabled.
  useEffect(() => {
    let cancelled = false;
    getPlatformSettings()
      .then((settings) => {
        if (!cancelled) {
          setPlatformSettings({ isDriverDynamicFeeEnabled: settings.isDriverDynamicFeeEnabled });
        }
      })
      .catch(() => {
        // Ignore errors — if we can't fetch settings, assume dynamic fee is disabled.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live quote — re-priced whenever the basket, the voucher, or the session
  // changes shape. The voucher is only sent to the server once the customer
  // presses "apply" (`appliedVoucher`), never on every keystroke.
  useEffect(() => {
    if (!cart.storeId || items.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuotePending(true);
    const controller = new AbortController();
    quoteOrder(
      {
        storeId: cart.storeId,
        items,
        voucherCode: appliedVoucher || undefined,
        deliveryRegion,
      },
      controller.signal
    )
      .then((result) => {
        if (cancelled) return;
        setQuote({
          subtotal: result.subtotal,
          deliveryFee: result.deliveryFee,
          discount: result.discount,
          voucherLabelAr: result.voucher?.labelAr ?? '',
          voucherLabelEn: result.voucher?.labelEn ?? '',
          totalAmount: result.totalAmount,
        });
        setQuoteError(null);
      })
      .catch((cause) => {
        if (cancelled) return;
        setQuoteError(cause instanceof Error ? (cause as ApiError) : null);
      })
      .finally(() => {
        if (!cancelled) setQuotePending(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cart.storeId, items, appliedVoucher, deliveryRegion, auth.user?.id, quoteRevision]);

  if (!auth.ready) {
    return (
      <PageTransition>
        <div className="flex min-h-screen items-center justify-center bg-canvas text-ink">
          <Loader2 size={22} className="animate-spin text-brand" />
        </div>
      </PageTransition>
    );
  }

  // Orders are personal — an anonymous visitor must sign in before checkout.
  if (!auth.user) {
    return (
      <PageTransition>
        <CustomerAuthGate auth={auth} reasonAr="سجّل الدخول لإتمام طلبك" reasonEn="Sign in to place your order" />
      </PageTransition>
    );
  }

  const useSavedAddress = saved.find((entry) => entry.id === selectedAddressId) ?? null;

  // Order placed — the form hands over to the success scene: a captain rides off
  // with the basket while a check mark draws itself.
  if (placedOrder) {
    return (
      <PageTransition>
        <main className="flex min-h-screen flex-col bg-canvas text-ink">
          <OrderSuccess
            orderNumber={placedOrder.orderNumber}
            eta={placedOrder.estimatedPrepMinutes ? `وصول الكابتن خلال ~${placedOrder.estimatedPrepMinutes} دقيقة` : undefined}
            actions={
              <>
                <Button
                  block
                  onClick={() => navigate(`/orders/${placedOrder.id}`)}
                >
                  تتبع الطلب
                </Button>
                <Button variant="secondary" block onClick={() => navigate('/')}>
                  العودة للمتاجر
                </Button>
              </>
            }
          />
        </main>
      </PageTransition>
    );
  }

  // Multi-store checkout success — grouped sub-orders.
  if (placedCheckout) {
    return (
      <PageTransition>
        <main className="flex min-h-screen flex-col bg-canvas text-ink">
          <div className="safe-top bg-brand px-5 pb-4 pt-4 text-white">
            <div className="mx-auto flex max-w-md items-center justify-between">
              <div className="flex items-center gap-2">
                <Check size={22} />
                <span className="text-lg font-bold">{t('تم الطلب بنجاح', 'Order placed')}</span>
              </div>
            </div>
          </div>
          <div className="mx-auto max-w-md space-y-4 px-4 py-6">
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <h2 className="text-sm font-extrabold">{t('ملخص الطلب', 'Order summary')}</h2>
              {placedCheckout.orders.map(sub => (
                <div key={sub.orderId} className="mt-3 rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">#{sub.orderNumber}</span>
                    <button type="button" onClick={() => navigate(`/orders/${sub.orderId}`)} className="text-xs font-bold text-brand">{t('تتبع', 'Track')}</button>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-ink-muted">
                    <span>{sub.itemCount} {t('منتج', 'items')}</span>
                    <span dir="ltr" className="font-bold text-ink">{formatCurrency(sub.totalAmount)}</span>
                  </div>
                </div>
              ))}
              <div className="mt-3 border-t border-line pt-3">
                <div className="flex justify-between text-sm font-extrabold">
                  <span>{t('الإجمالي', 'Total')}</span>
                  <span dir="ltr">{formatCurrency(placedCheckout.grandTotal)}</span>
                </div>
              </div>
            </div>
            <Button block onClick={() => navigate('/')}>{t('العودة للمتاجر', 'Back to stores')}</Button>
          </div>
        </main>
      </PageTransition>
    );
  }

  const handleSubmit = async () => {
    // Double-tap guard: only one placement in flight, ever. The latch lives in
    // a try/finally so EVERY exit path — validation short-circuits included —
    // releases it; a leak here would permanently block further orders.
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setFieldError(null);
      setSubmitError(null);

      const finalText = (useSavedAddress?.addressText ?? addressText).trim();
      if (!finalText) {
        setFieldError(t('يرجى إدخال عنوان التوصيل', 'Please enter a delivery address'));
        await hapticError();
        return;
      }
      if (!cart.storeId || items.length === 0) {
        setSubmitError(
          Object.assign(new Error(t('سلتك فارغة', 'Your cart is empty')), {
            message: t('سلتك فارغة', 'Your cart is empty'),
          }) as ApiError
        );
        await hapticError();
        return;
      }

      // Persist the address for the next order, if the customer wants it.
      if (saveForNextTime) {
        const entry: SavedAddress = {
          id: useSavedAddress?.id ?? `${Date.now()}`,
          label: useSavedAddress?.label ?? finalText.slice(0, 24),
          tag: useSavedAddress?.tag ?? addressTag,
          addressText: finalText,
          addressNote: addressNote.trim() || useSavedAddress?.addressNote || undefined,
          ...(pickedLat !== undefined && pickedLng !== undefined ? { lat: pickedLat, lng: pickedLng } : {}),
        };
        setSaved((current) => {
          const next = upsertAddress(current, entry);
          writeSavedAddresses(next);
          return next;
        });
      }

      setPlacing(true);

      if (cart.isMultiStore) {
        // Multi-store: split into per-store sub-orders.
        const storeGroups = cart.storeGroups.map(group => ({
          storeId: group.storeId,
          items: group.lines.map(line => ({
            productId: line.productId,
            quantity: line.quantity,
            ...(line.note.trim() ? { note: line.note.trim() } : {}),
          })),
        }));
        const result = await checkoutOrders({
          stores: storeGroups,
          customerAddressText: finalText,
          deliveryRegion,
          addressNote: addressNote.trim() || useSavedAddress?.addressNote || undefined,
          orderNote: orderNote.trim() || undefined,
          deliveryPreset: deliveryPreset || undefined,
          latitude: pickedLat,
          longitude: pickedLng,
        });
        await hapticSuccess();
        cart.clear();
        setPlacedCheckout(result);
      } else {
        // Single-store: existing flow.
        const created = await createOrder({
          storeId: cart.storeId!,
          items,
          customerAddressText: finalText,
          deliveryRegion,
          addressNote: addressNote.trim() || useSavedAddress?.addressNote || undefined,
          orderNote: orderNote.trim() || undefined,
          deliveryPreset: deliveryPreset || undefined,
          latitude: pickedLat,
          longitude: pickedLng,
          voucherCode: appliedVoucher || undefined,
        });
        await hapticSuccess();
        cart.clear();
        setPlacedOrder(created);
      }
    } catch (cause) {
      const apiError =
        cause instanceof Error && 'code' in (cause as ApiError)
          ? (cause as ApiError)
          : (Object.assign(new Error(String(cause)), { message: String(cause) }) as ApiError);
      setSubmitError(apiError);
      // A stale basket is expected (the quote is a snapshot) — re-quote so the
      // customer immediately sees the current price/availability instead of a
      // dead-end error. `quoteRevision` re-runs the live-quote effect.
      if (STALE_BASKET_CODES.has(apiError.code)) {
        setQuoteRevision((value) => value + 1);
      }
      await hapticError();
    } finally {
      submittingRef.current = false;
      setPlacing(false);
    }
  };

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
              <h1 className="text-lg font-extrabold">{t('إتمام الطلب', 'Checkout')}</h1>
            </div>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">
              {cart.itemCount}
            </span>
          </div>
        </header>

        <div className="mx-auto max-w-md space-y-4 px-5 pt-6">
          {/* Store summary */}
          <section className="rounded-2xl bg-surface p-4 shadow-card">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
                <StoreIcon size={18} />
              </span>
              <div className="flex-1 text-end">
                <h2 className="text-sm font-extrabold">{t(cart.storeNameAr || 'المتجر', 'Store')}</h2>
                <p className="text-[11px] text-ink-muted">{cart.itemCount} {t('صنف', 'items')}</p>
              </div>
            </div>
          </section>

          {/* Address */}
          <section className="rounded-2xl bg-surface p-4 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <MapPin size={16} className="text-brand" /> عنوان التوصيل
            </h2>

            {saved.length > 0 && (
              <div className="mt-3 space-y-2">
                {saved.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSelectedAddressId(entry.id);
                      if (entry.tag) setAddressTag(normalizeTag(entry.tag));
                      if (entry.lat && entry.lng) {
                        setPickedLat(entry.lat);
                        setPickedLng(entry.lng);
                      } else {
                        setPickedLat(undefined);
                        setPickedLng(undefined);
                      }
                    }}
                    className={`flex w-full items-start gap-2 rounded-xl border p-3 text-end transition ${
                      selectedAddressId === entry.id
                        ? 'border-brand bg-brand-tint'
                        : 'border-line bg-canvas'
                    }`}
                  >
                    <span className="flex-1">
                      <span className="flex items-center gap-2">
                        <span className="block text-xs font-bold">{entry.label}</span>
                        {entry.tag && (
                          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-micro font-bold text-brand-dark">
                            {t(ADDRESS_TAG_META[normalizeTag(entry.tag)].ar, ADDRESS_TAG_META[normalizeTag(entry.tag)].en)}
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-ink-muted">{entry.addressText}</span>
                    </span>
                    {selectedAddressId === entry.id && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-[11px] font-bold text-ink-muted">
                  الحي / الشارع / علامة مميزة
                </span>
                <textarea
                  value={addressText}
                  onChange={(event) => setAddressText(event.target.value)}
                  rows={2}
                  placeholder="مثال: بجانب مسجد عمر، مقابل الملعب"
                  className="input-field mt-1.5 w-full"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-ink-muted">{t('منطقة التوصيل', 'Delivery region')}</span>
                <select
                  value={deliveryRegion}
                  onChange={(event) => setDeliveryRegion(event.target.value as DeliveryRegion)}
                  className="input-field mt-1.5 w-full"
                  aria-label="Delivery region"
                >
                  <option value="central">{t('داخل السموع', 'Central')}</option>
                  <option value="outer">{t('الأطراف', 'Outer area')}</option>
                  <option value="remote">{t('منطقة بعيدة', 'Remote area')}</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-ink-muted">ملاحظات إضافية</span>
                <input
                  type="text"
                  value={addressNote}
                  onChange={(event) => setAddressNote(event.target.value)}
                  placeholder="اختياري — مثال: الطابق الثاني"
                  className="input-field mt-1.5 w-full"
                />
              </label>

              {/* Map picker button */}
              <button
                type="button"
                onClick={() => setShowMapPicker(true)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-canvas p-3 text-start transition hover:border-brand active:scale-[98%]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-tint text-brand">
                  <Navigation size={17} />
                </span>
                <span className="flex-1">
                  <span className="block text-xs font-bold">{t('حدد الموقع على الخريطة', 'Pin location on map')}</span>
                  <span className="block text-[10px] text-ink-muted">
                    {pickedLat && pickedLng
                      ? `${pickedLat.toFixed(5)}, ${pickedLng.toFixed(5)}`
                      : t('اختياري — يساعد الكابتن الوصول بسرعة', 'Optional — helps the captain find you faster')}
                  </span>
                </span>
                {(pickedLat && pickedLng) && (
                  <Check size={14} className="text-brand-dark" />
                )}
              </button>

              {/* Delivery preset */}
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[11px] font-bold text-ink-muted">{t('تعليمات التوصيل', 'Delivery instructions')}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryPreset(deliveryPreset === 'call_on_arrival' ? '' : 'call_on_arrival')}
                    className={`flex-1 rounded-lg border px-2 py-2 text-[11px] font-bold transition ${
                      deliveryPreset === 'call_on_arrival'
                        ? 'border-brand bg-brand-tint text-brand-dark'
                        : 'border-line bg-surface text-ink-muted'
                    }`}
                  >
                    <Phone size={12} className="inline-block ms-1" />
                    {t('اتصل عند الوصول', 'Call on arrival')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryPreset(deliveryPreset === 'leave_at_door' ? '' : 'leave_at_door')}
                    className={`flex-1 rounded-lg border px-2 py-2 text-[11px] font-bold transition ${
                      deliveryPreset === 'leave_at_door'
                        ? 'border-brand bg-brand-tint text-brand-dark'
                        : 'border-line bg-surface text-ink-muted'
                    }`}
                  >
                    <Package size={12} className="inline-block ms-1" />
                    {t('اترك عند الباب', 'Leave at door')}
                  </button>
                </div>
              </div>
              {saved.length > 0 && (
                <label className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2.5">
                  <span className="text-[11px] font-bold text-ink-muted">إدخال عنوان جديد</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAddressId(null);
                      setAddressText('');
                      setAddressTag('home');
                      setPickedLat(undefined);
                      setPickedLng(undefined);
                    }}
                    className="rounded-full bg-brand-tint px-3 py-1 text-[11px] font-bold text-brand-dark"
                  >
                    عنوان جديد
                  </button>
                </label>
              )}
              <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
                <input
                  type="checkbox"
                  checked={saveForNextTime}
                  onChange={(event) => setSaveForNextTime(event.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                <Save size={13} /> حفظ هذا العنوان للطلبات القادمة
              </label>

              {saveForNextTime && (
                <div className="rounded-xl bg-canvas p-3" role="group" aria-label={t('نوع العنوان', 'Address tag')}>
                  <p className="text-micro font-bold text-ink-muted">{t('نوع العنوان', 'Tag')}</p>
                  <div className="mt-2 flex gap-2">
                    {ADDRESS_TAGS.map((tag) => {
                      const active = addressTag === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setAddressTag(tag)}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                            active ? 'border-brand bg-brand-tint text-brand-dark' : 'border-line bg-surface text-ink-muted'
                          }`}
                        >
                          {t(ADDRESS_TAG_META[tag].ar, ADDRESS_TAG_META[tag].en)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-surface p-4 shadow-card">
            <h2 className="text-sm font-extrabold">{t('ملاحظة إضافية للطلب', 'Additional order note')}</h2>
            <p className="mt-1 text-[11px] text-ink-muted">
              {t('تظهر للكابتن والمتجر — مثال: لا تضع معجون', 'Visible to the captain & store — e.g. no paste')}
            </p>
            <textarea value={orderNote} onChange={(event) => setOrderNote(event.target.value)} maxLength={500} rows={2} placeholder={t('مثال: لا تضع معجون', 'e.g. no paste')} className="input-field mt-3 w-full" />
          </section>

          {/* Payment — COD only, by design. */}
          <section className="rounded-2xl bg-surface p-4 shadow-card">
            <h2 className="text-sm font-extrabold">طريقة الدفع</h2>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-brand bg-brand-tint p-3 text-start"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
                  <Banknote size={17} />
                </span>
                <span className="flex-1">
                  <span className="block text-xs font-bold">{t('الدفع عند الاستلام', 'Cash on delivery')}</span>
                </span>
                <Check size={16} className="text-brand-dark" />
              </button>
              <button
                type="button"
                disabled
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-canvas p-3 text-start opacity-70"
                title={t('قريباً', 'Coming soon')}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-line-soft text-ink-muted">
                  <CreditCard size={17} />
                </span>
                <span className="flex-1">
                  <span className="block text-xs font-bold">{t('بطاقة / محفظة إلكترونية', 'Card / wallet')}</span>
                </span>
              </button>
            </div>
          </section>

          {/* Voucher — disabled for multi-store carts */}
          {!cart.isMultiStore && (
          <section className="rounded-2xl bg-surface p-4 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <Ticket size={16} className="text-brand" /> {t('كوبون خصم', 'Voucher')}
            </h2>
            {appliedVoucher && !quoteError ? (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-brand bg-brand-tint p-3">
                <span className="flex items-center gap-2 text-xs font-bold text-brand-dark">
                  <Check size={14} strokeWidth={3} />
                  <span dir="ltr">{appliedVoucher}</span>
                  {quote?.discount ? ` — ${formatCurrency(quote.discount)}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAppliedVoucher('');
                    setVoucherInput('');
                    setQuoteError(null);
                  }}
                  className="rounded-full bg-surface px-3 py-1 text-[11px] font-bold text-ink-muted"
                >
                  إزالة
                </button>
              </div>
            ) : (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={voucherInput}
                    onChange={(event) => {
                      setVoucherInput(event.target.value);
                      setAppliedVoucher('');
                      setQuoteError(null);
                    }}
                    placeholder="أدخل رمز الكوبون"
                    className="input-field w-full uppercase"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setAppliedVoucher(voucherInput.trim().toUpperCase())}
                    disabled={voucherInput.trim().length === 0 || Boolean(quotePending)}
                    className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition active:scale-95 disabled:opacity-60"
                  >
                    {quotePending ? <Loader2 size={14} className="animate-spin" /> : 'تطبيق'}
                  </button>
                </div>
                {quoteError && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-danger-ink">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {isArabic ? quoteError.message : quoteError.localizedMessage}
                  </p>
                )}
              </>
            )}
          </section>
          )}

          {/* Quote — multi-store: local summary from cart */}
          {cart.isMultiStore ? (
          <section className="rounded-2xl bg-surface p-4 shadow-card">
            <h2 className="text-sm font-extrabold">{t('ملخص الطلب', 'Order summary')}</h2>
            {cart.storeGroups.map(group => (
              <div key={group.storeId} className="mt-3 rounded-xl border border-line p-3">
                <h3 className="text-xs font-bold text-ink-muted">{group.storeNameAr || t('المتجر', 'Store')}</h3>
                <div className="mt-1.5 space-y-1 text-xs">
                  {group.lines.map(line => (
                    <div key={line.productId} className="flex justify-between">
                      <span className="text-ink-muted">{line.product.nameAr} × {line.quantity}</span>
                      <span dir="ltr" className="font-semibold text-ink">{formatCurrency(line.quantity * line.product.price)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between border-t border-line pt-2 text-xs">
                  <span className="font-extrabold">{t('المجموع', 'Subtotal')}</span>
                  <span dir="ltr" className="font-extrabold text-ink">{formatCurrency(group.subtotal)}</span>
                </div>
              </div>
            ))}
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex justify-between text-sm font-extrabold">
                <span>{t('الإجمالي', 'Total')}</span>
                <span dir="ltr" className="text-brand-dark">{formatCurrency(cart.subtotal)}</span>
              </div>
              <p className="mt-1 text-[10px] text-ink-muted text-center">{t('رسوم التوصيل تُحدّد بواسطة السائق', 'Delivery fee set by driver')}</p>
            </div>
          </section>
          ) : (
          <section className="rounded-2xl bg-surface p-4 shadow-card">
            <h2 className="text-sm font-extrabold">ملخص الطلب</h2>
            {quotePending && !quote ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
                <Loader2 size={14} className="animate-spin text-brand" /> جاري احتساب السعر…
              </div>
            ) : quote ? (
              <>
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-ink-muted">
                    <span>المجموع الفرعي</span>
                    <span dir="ltr" className="font-bold text-ink">{formatCurrency(quote.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-ink-muted">
                    <span>{deliveryFeeLabel(language)}</span>
                    <span dir="ltr" className="font-bold text-brand-dark">
                      {platformSettings?.isDriverDynamicFeeEnabled
                        ? (isArabic ? DRIVER_FEE_LABEL.ar : DRIVER_FEE_LABEL.en)
                        : formatCurrency(quote.deliveryFee)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-brand-dark bg-brand-tint rounded px-2 py-1 text-center">
                    {t(DRIVER_FEE_NOTICE.ar, DRIVER_FEE_NOTICE.en)}
                  </p>
                  {quote.discount > 0 && (
                    <div className="flex justify-between text-brand-dark">
                      <span>{isArabic ? quote.voucherLabelAr : quote.voucherLabelEn || t('خصم الكوبون', 'Voucher discount')}</span>
                      <span dir="ltr" className="font-bold">− {formatCurrency(quote.discount)}</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex justify-between border-t border-line pt-2.5 text-sm">
                  <span className="font-extrabold">الإجمالي</span>
                  <span dir="ltr" className="font-extrabold text-brand-dark">{formatCurrency(quote.totalAmount)}</span>
                </div>
              </>
            ) : quoteError ? (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-danger-ink">
                <span>{isArabic ? quoteError.message : quoteError.localizedMessage}</span>
                <button
                  type="button"
                  onClick={() => setQuoteRevision((v) => v + 1)}
                  className="inline-flex items-center gap-1 rounded-full bg-danger-tint px-2.5 py-1 font-bold"
                >
                  <RefreshCw size={12} /> إعادة
                </button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-ink-muted">أضف أصنافاً لعرض السعر</p>
            )}
          </section>
          )}

          {fieldError && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-[11px] font-semibold text-danger-ink" role="alert">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {fieldError}
            </p>
          )}
          {submitError && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-[11px] font-semibold text-danger-ink" role="alert">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {isArabic ? submitError.message : submitError.localizedMessage}
            </p>
          )}

          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={cart.lines.length === 0}
            loading={placing}
            block
            icon={placing ? undefined : <Package size={16} />}
          >
            {t('تأكيد الطلب — الدفع عند الاستلام', 'Confirm order — cash on delivery')}
          </Button>
          <p className="pb-4 text-center text-micro text-ink-muted" dir="ltr">
            Samou' is a cash economy — the captain collects on delivery.
          </p>
        </div>
      </main>

      {/* Interactive map picker — full screen on mobile */}
      <MapPicker
        isOpen={showMapPicker}
        initialLat={pickedLat}
        initialLng={pickedLng}
        onPick={(lat, lng) => { setPickedLat(lat); setPickedLng(lng); }}
        onClose={() => setShowMapPicker(false)}
      />
    </PageTransition>
  );
}
