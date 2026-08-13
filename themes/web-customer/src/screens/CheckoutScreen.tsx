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
  Package,
  RefreshCw,
  Save,
  Store as StoreIcon,
  Ticket,
} from 'lucide-react';
import type { ApiError } from '@samou-go/api-client';
import { createOrder, quoteOrder } from '@/hooks/useApi';
import { useCart } from '@/components/CartProvider';
import { CustomerAuthGate } from '@/components/CustomerAuthGate';
import { useAuth } from '@/hooks/useApi';
import { formatCurrency, FREE_DELIVERY_LABEL, deliveryFeeLabel } from '@/lib/delivery';
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
import type { DeliveryRegion } from '@samou-go/shared-types';

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

  const [saved, setSaved] = useState<SavedAddress[]>(() => readSavedAddresses());
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressText, setAddressText] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const [deliveryRegion, setDeliveryRegion] = useState<DeliveryRegion>('central');
  const [orderNote, setOrderNote] = useState('');
  const [saveForNextTime, setSaveForNextTime] = useState(true);
  /** Home / Work / Other — persisted with the saved address, shown as a chip. */
  const [addressTag, setAddressTag] = useState<AddressTag>('home');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{
    subtotal: number;
    deliveryFee: number;
    discount: number;
    voucherLabel: string;
    totalAmount: number;
  } | null>(null);
  const [quoteError, setQuoteError] = useState<ApiError | null>(null);
  const [quotePending, setQuotePending] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState('');
  const [placing, setPlacing] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  /** Re-fetches the live quote — bumped when a stale-basket error is caught. */
  const [quoteRevision, setQuoteRevision] = useState(0);
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.length]);

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
          voucherLabel: result.voucher?.labelAr ?? '',
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

  const handleSubmit = async () => {
    // Double-tap guard: only one placement in flight, ever.
    if (submittingRef.current) return;
    submittingRef.current = true;

    setFieldError(null);
    setSubmitError(null);

    const finalText = (useSavedAddress?.addressText ?? addressText).trim();
    if (!finalText) {
      setFieldError('يرجى إدخال عنوان التوصيل / Please enter a delivery address');
      await hapticError();
      return;
    }
    if (!cart.storeId || items.length === 0) {
      setSubmitError(
        Object.assign(new Error('سلتك فارغة / Your cart is empty'), {
          message: 'سلتك فارغة / Your cart is empty',
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
      };
      setSaved((current) => {
        const next = upsertAddress(current, entry);
        writeSavedAddresses(next);
        return next;
      });
    }

    setPlacing(true);
    try {
      await createOrder({
        storeId: cart.storeId,
        items,
        customerAddressText: finalText,
        deliveryRegion,
        addressNote: addressNote.trim() || useSavedAddress?.addressNote || undefined,
        orderNote: orderNote.trim() || undefined,
        voucherCode: appliedVoucher || undefined,
      });
      await hapticSuccess();
      cart.clear();
      navigate('/');
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
      <main dir="rtl" className="min-h-screen bg-canvas pb-16 text-ink">
        <header className="safe-top bg-brand px-5 pb-4 pt-4 text-white">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <button
              type="button"
              aria-label="رجوع / Back"
              onClick={() => navigate(-1)}
              className="rounded-full p-2 transition hover:bg-surface/15 active:scale-95"
            >
              <ArrowRight size={22} />
            </button>
            <div className="flex-1 text-end">
              <h1 className="text-lg font-extrabold">إتمام الطلب</h1>
              <p className="text-[11px] text-white/80" dir="ltr">
                Checkout
              </p>
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
                <h2 className="text-sm font-extrabold">{cart.storeNameAr || 'المتجر'}</h2>
                <p className="text-[11px] text-ink-muted">{cart.itemCount} صنف</p>
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
                          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[9px] font-bold text-brand-dark">
                            {ADDRESS_TAG_META[normalizeTag(entry.tag)].ar}
                            <span dir="ltr" className="ms-1">
                              {ADDRESS_TAG_META[normalizeTag(entry.tag)].en}
                            </span>
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
                <span className="text-[11px] font-bold text-ink-muted">منطقة التوصيل / Delivery region</span>
                <select
                  value={deliveryRegion}
                  onChange={(event) => setDeliveryRegion(event.target.value as DeliveryRegion)}
                  className="input-field mt-1.5 w-full"
                  aria-label="Delivery region"
                >
                  <option value="central">داخل السموع / Central</option>
                  <option value="outer">الأطراف / Outer area</option>
                  <option value="remote">منطقة بعيدة / Remote area</option>
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
              {saved.length > 0 && (
                <label className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2.5">
                  <span className="text-[11px] font-bold text-ink-muted">إدخال عنوان جديد</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAddressId(null);
                      setAddressText('');
                      setAddressTag('home');
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
                <div className="rounded-xl bg-canvas p-3" role="group" aria-label="نوع العنوان / Address tag">
                  <p className="text-[10px] font-bold text-ink-muted">نوع العنوان <span dir="ltr">/ Tag</span></p>
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
                          {ADDRESS_TAG_META[tag].ar}
                          <span dir="ltr" className="ms-1 text-[10px] font-semibold opacity-80">
                            {ADDRESS_TAG_META[tag].en}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-surface p-4 shadow-card">
            <h2 className="text-sm font-extrabold">ملاحظة للطلب <span dir="ltr" className="text-[10px] font-normal text-ink-muted">/ Order note</span></h2>
            <textarea value={orderNote} onChange={(event) => setOrderNote(event.target.value)} maxLength={500} rows={2} placeholder="مثال: الاتصال قبل الوصول" className="input-field mt-3 w-full" />
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
                  <span className="block text-xs font-bold">الدفع عند الاستلام</span>
                  <span className="block text-[10px] text-ink-muted" dir="ltr">
                    Cash on delivery
                  </span>
                </span>
                <Check size={16} className="text-brand-dark" />
              </button>
              <button
                type="button"
                disabled
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-canvas p-3 text-start opacity-70"
                title="قريباً / Coming soon"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-line-soft text-ink-subtle">
                  <CreditCard size={17} />
                </span>
                <span className="flex-1">
                  <span className="block text-xs font-bold">بطاقة / محفظة إلكترونية</span>
                  <span className="block text-[10px] text-ink-subtle" dir="ltr">
                    Card / wallet — coming soon
                  </span>
                </span>
              </button>
            </div>
          </section>

          {/* Voucher */}
          <section className="rounded-2xl bg-surface p-4 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <Ticket size={16} className="text-brand" /> كوبون خصم
              <span className="ms-1 text-[10px] font-semibold text-ink-subtle" dir="ltr">
                Voucher
              </span>
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
                    {quoteError.message}
                  </p>
                )}
              </>
            )}
          </section>

          {/* Quote */}
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
                    <span>{deliveryFeeLabel('both')}</span>
                    <span dir="ltr" className="font-bold text-brand-dark">
                      {quote.deliveryFee <= 0
                        ? `${FREE_DELIVERY_LABEL.ar} / ${FREE_DELIVERY_LABEL.en}`
                        : formatCurrency(quote.deliveryFee)}
                    </span>
                  </div>
                  {quote.discount > 0 && (
                    <div className="flex justify-between text-brand-dark">
                      <span>{quote.voucherLabel || 'خصم الكوبون'}</span>
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
                <span>{quoteError.message}</span>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1 rounded-full bg-danger-tint px-2.5 py-1 font-bold"
                >
                  <RefreshCw size={12} /> إعادة
                </button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-ink-muted">أضف أصنافاً لعرض السعر</p>
            )}
          </section>

          {fieldError && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-[11px] font-semibold text-danger-ink" role="alert">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {fieldError}
            </p>
          )}
          {submitError && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-[11px] font-semibold text-danger-ink" role="alert">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {submitError.message}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={placing || cart.lines.length === 0}
            className="btn-primary w-full justify-center"
          >
            {placing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Package size={16} />
            )}
            تأكيد الطلب — الدفع عند الاستلام
          </button>
          <p className="pb-4 text-center text-[10px] text-ink-subtle" dir="ltr">
            Samou' is a cash economy — the captain collects on delivery.
          </p>
        </div>
      </main>
    </PageTransition>
  );
}
