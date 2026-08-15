/**
 * Samou' Go — checkout.
 *
 * The basket is built from a live store catalogue (`GET /stores/:id`), so every
 * line carries a real `productId`. Pricing is never computed here: the screen
 * asks `POST /orders/quote` for the subtotal, the delivery fee and the total,
 * and submits with `POST /orders`, which prices the basket again server-side
 * from the products table. `CreateOrderInput` deliberately has no money fields
 * — see DESIGN_SYSTEM.md §8.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  LogOut,
  MapPin,
  Minus,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Truck,
  WalletCards,
} from 'lucide-react';
import {
  SignInGate,
  createOrder,
  quoteOrder,
  useAuth,
  useMutation,
  useResource,
  useStore,
  useStores,
  useToast,
} from '@samou-go/api-client';
import type {
  CreateOrderInput,
  CreateOrderItemInput,
  OrderDetail,
  OrderQuote,
  Product,
} from '@samou-go/shared-types';
import { DeliveryFee, OrderSuccess } from '@samou-go/ui';
import {
  CURRENCY,
  calculateDeliveryFee,
  formatCurrency,
} from '@/lib/delivery';
import { HeaderNav } from './HeaderNav';
import { BottomTabs } from './BottomTabs';

/** Long enough to finish tapping "+" a few times, short enough to feel live. */
const QUOTE_DEBOUNCE_MS = 300;

/** Where the tracking app is served. Overridable so this is not localhost-only. */
const TRACKING_URL: string = (
  import.meta.env.VITE_TRACKING_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:5176')
).replace(/\/+$/, '');

/** Where the store-details app is served. Used for the back button. Override with VITE_STORE_URL in .env */
const STORE_URL: string = (
  import.meta.env.VITE_STORE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:5174')
).replace(/\/+$/, '');

/** The server rejects a whitespace-only address; catch it before the round-trip. */
const MIN_ADDRESS_LENGTH = 6;

/** Errors that mean the catalogue we are showing is out of date. */
const STALE_CATALOGUE_CODES = new Set(['STORE_CLOSED', 'PRODUCT_NOT_IN_STORE', 'PRODUCT_UNAVAILABLE']);

/** Deterministic tint per product, so the placeholder tiles are not all identical. */
const TILE_TONES = [
  'bg-brand-surface text-brand-deep',
  'bg-warning-tint text-warning-ink',
  'bg-info-tint text-info-ink',
] as const;

function tileTone(index: number): string {
  return TILE_TONES[index % TILE_TONES.length] ?? TILE_TONES[0];
}

export const CartCheckoutSummary = () => {
  const auth = useAuth();
  const toast = useToast();

  /* ---- Which store are we ordering from? ------------------------------- */

  // `?storeId=` is how the store-details screen will hand a shop over. Without
  // it, fall back to the first open store so the screen is never empty.
  const storeIdParam = useMemo(
    () => new URLSearchParams(window.location.search).get('storeId'),
    []
  );
  const storeList = useStores(
    { activeOnly: true, pageSize: 1 },
    { enabled: !storeIdParam }
  );
  const storeId = storeIdParam ?? storeList.data?.items[0]?.id ?? null;
  const store = useStore(storeId);

  const products: Product[] = useMemo(
    () =>
      (store.data?.categories ?? [])
        .flatMap((category) => category.products)
        .filter((product) => product.isAvailable),
    [store.data]
  );

  /* ---- Basket ----------------------------------------------------------- */

  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const items: CreateOrderItemInput[] = useMemo(
    () =>
      products
        .filter((product) => (quantities[product.id] ?? 0) > 0)
        .map((product) => ({ productId: product.id, quantity: quantities[product.id] as number })),
    [products, quantities]
  );

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const hasItems = items.length > 0;

  const setQuantity = (productId: string, delta: number) => {
    setQuantities((current) => {
      const next = { ...current };
      const quantity = Math.max(0, (current[productId] ?? 0) + delta);
      // Zero is absence, not a line worth 0 — the quote must not carry it.
      if (quantity === 0) delete next[productId];
      else next[productId] = quantity;
      return next;
    });

    // Feedback the moment something lands in the basket — the basket itself is
    // a different tab, so the toast is the only "added" cue.
    if (delta > 0 && (quantities[productId] ?? 0) === 0) {
      const product = products.find((p) => p.id === productId);
      if (product) {
        toast.success(`تمت إضافة ${product.nameAr} إلى السلة`, `Added to cart`);
      }
    }
  };

  /* ---- Instant delivery-tariff preview ----------------------------------- */

  // The server quote debounces by 300 ms; this preview keeps the fee honest in
  // the gap, using the exact rule the server prices with (free delivery — 0 ₪).
  const previewDeliveryFee = hasItems ? calculateDeliveryFee(itemCount) : 0;

  /* ---- Quote ------------------------------------------------------------ */

  // Debounced: every tap on "+" would otherwise be a round-trip over Samou'
  // mobile data. The basket renders instantly; only the price lags 300 ms.
  const itemsKey = JSON.stringify(items);
  const [quotedKey, setQuotedKey] = useState(itemsKey);
  useEffect(() => {
    const timer = setTimeout(() => setQuotedKey(itemsKey), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [itemsKey]);

  const quotedItems: CreateOrderItemInput[] = useMemo(
    () => JSON.parse(quotedKey) as CreateOrderItemInput[],
    [quotedKey]
  );

  const quote = useResource<OrderQuote>(
    `quote:${storeId ?? ''}:${quotedKey}`,
    (signal) => quoteOrder({ storeId: storeId as string, items: quotedItems }, signal),
    { enabled: Boolean(storeId) && quotedItems.length > 0 }
  );

  // A quote for a basket the customer has already changed is not the price they
  // are looking at, so the totals wait rather than lie.
  const quoteStale = quotedKey !== itemsKey || quote.loading || quote.refreshing;
  const bill: OrderQuote | null = hasItems ? quote.data : null;

  /* ---- Address ---------------------------------------------------------- */

  const [address, setAddress] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const addressValid = address.trim().length >= MIN_ADDRESS_LENGTH;

  /* ---- Submit ----------------------------------------------------------- */

  const submit = useMutation<CreateOrderInput, OrderDetail>((input, signal) =>
    createOrder(input, signal)
  );
  const placed = submit.data;

  // A basket the server has just rejected is worth re-reading: the shop may
  // have closed or a product may have gone out of stock while we sat here.
  useEffect(() => {
    if (submit.error && STALE_CATALOGUE_CODES.has(submit.error.code)) store.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submit.error]);

  const canSubmit = hasItems && addressValid && !quoteStale && !submit.pending && Boolean(storeId);

  const handlePlaceOrder = async () => {
    if (!canSubmit || !storeId) return;
    const result = await submit.run({
      storeId,
      items,
      customerAddressText: address.trim(),
      ...(addressNote.trim() ? { addressNote: addressNote.trim() } : {}),
    });
    if (result) {
      toast.success('تم إرسال طلبك بنجاح 🎉', 'Your order has been submitted', { duration: 4_500 });
    }
  };

  /* ---- Gates ------------------------------------------------------------ */

  if (!auth.ready) {
    return (
      <div className="min-h-screen bg-canvas" dir="rtl" aria-busy="true">
        <HeaderNav title="Checkout / الدفع" showBack={false} showCart={false} />
        <div className="mx-auto w-full max-w-lg space-y-3 px-4 pt-6" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-[86px] animate-pulse rounded-xl bg-surface shadow-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!auth.user) {
    return <SignInGate auth={auth} reasonAr="سجّل الدخول لإتمام طلبك" reasonEn="Sign in to place your order" />;
  }

  /* ---- Confirmation ----------------------------------------------------- */

  if (placed) {
    return (
      <div className="min-h-screen bg-canvas text-ink" dir="rtl">
        <HeaderNav title="Order placed / تم الطلب" showBack={false} showCart={false} />
        <main className="mx-auto w-full max-w-lg px-4 pb-32 pt-6" aria-live="polite">
          <OrderSuccess
            orderNumber={placed.orderNumber}
            actions={
              <>
                <a
                  href={`${TRACKING_URL}/?orderId=${encodeURIComponent(placed.id)}`}
                  className="btn-primary w-full justify-center"
                >
                  <Truck size={20} />
                  تتبّع الطلب <span dir="ltr">Track order</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    submit.reset();
                    setQuantities({});
                  }}
                  className="btn-secondary w-full justify-center"
                >
                  طلب جديد <span dir="ltr">New order</span>
                </button>
              </>
            }
          />

          <dl className="mx-auto mt-4 w-full max-w-sm space-y-2 rounded-xl bg-surface p-5 text-sm shadow-card ring-1 ring-line">
            <div className="flex items-center justify-between text-ink-muted">
              <dt>الإجمالي / Total</dt>
              <dd dir="ltr" className="font-black text-ink">
                {formatCurrency(placed.totalAmount, { unit: 'code' })}
              </dd>
            </div>
            <div className="flex items-center justify-between text-ink-muted">
              <dt>العنوان / Address</dt>
              <dd className="max-w-[60%] truncate font-semibold text-ink">
                {placed.customerAddressText}
              </dd>
            </div>
          </dl>
        </main>
        <BottomTabs activeTab="orders" />
      </div>
    );
  }

  /* ---- Checkout --------------------------------------------------------- */

  const catalogueLoading = store.loading || (!storeIdParam && storeList.loading);
  const catalogueError = store.error ?? (!storeIdParam ? storeList.error : null);
  const catalogueEmpty = !catalogueLoading && !catalogueError && products.length === 0;

  return (
    <div className="min-h-screen bg-canvas text-ink" dir="rtl">
      <HeaderNav
        title="Checkout / الدفع"
        arabicTitle={store.data?.nameAr}
        showBack
        showCart
        cartCount={itemCount}
        onBack={() => {
          const backUrl = storeId
            ? `${STORE_URL}/?storeId=${encodeURIComponent(storeId)}`
            : STORE_URL;
          window.location.href = backUrl;
        }}
      />

      <main className="mx-auto w-full max-w-lg px-4 pb-32 pt-5">
        <section aria-labelledby="cart-heading" aria-busy={catalogueLoading}>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                Your basket
              </p>
              <h2 id="cart-heading" className="text-[25px] font-black tracking-[-0.04em] text-ink">
                Review your order
              </h2>
              <p className="mt-1 text-sm text-ink-muted">راجع طلبك قبل التأكيد</p>
            </div>
            <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink-muted shadow-card ring-1 ring-line">
              {itemCount} items / أصناف
            </span>
          </div>

          {catalogueError && (
            <div
              className="rounded-xl border border-danger-tint bg-surface p-5 text-center shadow-card"
              aria-live="assertive"
            >
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
                <AlertTriangle size={22} />
              </span>
              <h3 className="mt-3 text-sm font-extrabold">تعذّر تحميل قائمة المتجر</h3>
              <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
                Could not load the store menu
              </p>
              <p className="mt-2 text-xs text-ink-soft">{catalogueError.message}</p>
              <button
                type="button"
                onClick={storeIdParam ? store.refresh : storeList.refresh}
                disabled={store.refreshing || storeList.refreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
              >
                {store.refreshing || storeList.refreshing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                إعادة المحاولة <span dir="ltr">Retry</span>
              </button>
            </div>
          )}

          {catalogueEmpty && (
            <div
              className="rounded-xl border border-line bg-surface p-6 text-center shadow-card"
              aria-live="polite"
            >
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
                <Package size={22} />
              </span>
              <h3 className="mt-3 text-sm font-extrabold">لا توجد منتجات متاحة في هذا المتجر</h3>
              <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
                This store has no available products
              </p>
            </div>
          )}

          {catalogueLoading && (
            <ul className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <li
                  key={index}
                  className="flex animate-pulse items-center gap-3 rounded-xl bg-surface p-3.5 shadow-card ring-1 ring-line"
                >
                  <div className="h-[62px] w-[62px] shrink-0 rounded-xl bg-line-soft" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/3 rounded bg-line-soft" />
                    <div className="h-3 w-1/2 rounded bg-line-soft" />
                  </div>
                  <div className="h-9 w-24 shrink-0 rounded-lg bg-line-soft" />
                </li>
              ))}
            </ul>
          )}

          {!catalogueLoading && !catalogueError && products.length > 0 && (
            <ul className="space-y-3" aria-label="Items in your cart">
              {products.map((product, index) => {
                const quantity = quantities[product.id] ?? 0;
                return (
                  <li
                    key={product.id}
                    className={`flex items-center gap-3 rounded-xl bg-surface p-3.5 shadow-card ring-1 transition ${
                      quantity > 0 ? 'ring-brand' : 'ring-line'
                    }`}
                  >
                    <div
                      className={`flex h-[62px] w-[62px] shrink-0 items-center justify-center overflow-hidden rounded-xl text-xl font-black ${tileTone(index)}`}
                      aria-hidden="true"
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        product.nameAr.slice(0, 1)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[15px] font-extrabold text-ink">{product.nameAr}</h3>
                      {product.description && (
                        <p className="truncate text-sm font-medium text-ink-muted">
                          {product.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-ink-subtle">
                        <span dir="ltr" className="font-bold text-brand">
                          {formatCurrency(product.price, { unit: 'code' })}
                        </span>
                      </p>
                    </div>
                    <div
                      className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-surface p-1"
                      aria-label={`Quantity for ${product.nameAr}`}
                    >
                      <button
                        type="button"
                        onClick={() => setQuantity(product.id, -1)}
                        disabled={quantity === 0}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-surface text-ink-muted shadow-card transition hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Decrease ${product.nameAr} quantity`}
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      <span className="w-4 text-center text-sm font-black text-ink">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity(product.id, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-white shadow-card transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand"
                        aria-label={`Increase ${product.nameAr} quantity`}
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-7" aria-labelledby="address-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="address-heading" className="text-lg font-black text-ink">
              Delivery address
            </h2>
            <span className="text-xs font-bold text-ink-subtle">مطلوب / Required</span>
          </div>
          <div className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-line">
            <label className="flex items-start gap-3">
              <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-surface text-brand">
                <MapPin size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-ink">
                  الحي والشارع وأقرب معلم
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted" dir="ltr">
                  Neighbourhood, street and nearest landmark
                </span>
                <input
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="مثال: حي الظاهرية، بجانب مسجد عمر"
                  aria-invalid={address.length > 0 && !addressValid}
                  className="input-field mt-2 w-full"
                />
              </span>
            </label>
            <label className="mt-3 block">
              <span className="text-xs font-bold text-ink-soft">
                ملاحظة للسائق <span dir="ltr" className="font-medium text-ink-subtle">/ Note for the captain (optional)</span>
              </span>
              <input
                type="text"
                value={addressNote}
                onChange={(event) => setAddressNote(event.target.value)}
                placeholder="الطابق الثاني، الجرس الأيمن"
                className="input-field mt-2 w-full"
              />
            </label>
            {address.length > 0 && !addressValid && (
              <p className="mt-2 text-[11px] font-semibold text-danger-ink">
                العنوان قصير جداً <span dir="ltr">/ Address is too short</span>
              </p>
            )}
          </div>
        </section>

        <section className="mt-7" aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="mb-3 text-lg font-black text-ink">
            Payment method
          </h2>
          <div className="flex items-center gap-3 rounded-xl border-2 border-brand bg-brand-surface p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-brand shadow-card">
              <WalletCards size={20} />
            </span>
            <span className="flex-1">
              <strong className="block text-sm font-extrabold text-ink">Cash on Delivery (COD)</strong>
              <span className="block text-sm text-ink-soft">الدفع عند الاستلام</span>
            </span>
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-brand bg-brand"
              aria-label="Selected"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-surface" />
            </span>
          </div>
        </section>

        <section
          className="mt-7 rounded-xl bg-surface p-5 shadow-card ring-1 ring-line"
          aria-labelledby="summary-heading"
          aria-busy={quoteStale}
        >
          <h2 id="summary-heading" className="mb-4 flex items-center gap-2 text-lg font-black text-ink">
            Bill summary <span className="font-medium text-ink-subtle">/ ملخص الفاتورة</span>
            {quoteStale && hasItems && (
              <Loader2 size={16} className="animate-spin text-brand" aria-label="Updating price" />
            )}
          </h2>

          {!hasItems && (
            <p className="py-2 text-sm text-ink-muted">
              أضف منتجات لعرض الفاتورة <span dir="ltr">/ Add items to see your bill</span>
            </p>
          )}

          {hasItems && quote.error && (
            <div className="rounded-lg bg-danger-tint p-3 text-center" aria-live="assertive">
              <p className="text-xs font-bold text-danger-ink">{quote.error.message}</p>
              <button
                type="button"
                onClick={quote.reload}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-danger-ink underline"
              >
                <RefreshCw size={12} /> إعادة حساب السعر <span dir="ltr">/ Recalculate</span>
              </button>
            </div>
          )}

          {hasItems && !quote.error && !bill && (
            <div className="space-y-3" aria-hidden="true">
              <div className="h-4 w-full animate-pulse rounded bg-line-soft" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-line-soft" />
              <div className="h-7 w-1/2 animate-pulse rounded bg-line-soft" />
            </div>
          )}

          {/* Instant delivery-tariff preview — shown while the debounced server
              quote is still in flight, so the fee never "jumps in" late. Uses the
              exact rule the server prices with (free delivery — 0 ₪). */}
          {hasItems && (quoteStale || !bill) && (
            <dl className="space-y-3 border-t border-dashed border-line pt-3 text-sm" aria-label="Delivery fee preview">
              <DeliveryFee amount={previewDeliveryFee} variant="row" showIcon note="تقدير فوري · Instant estimate" />
            </dl>
          )}

          {hasItems && bill && (
            <dl className={`space-y-3 text-sm transition-opacity ${quoteStale ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between text-ink-muted">
                <dt>Subtotal / المجموع الفرعي</dt>
                <dd dir="ltr" className="font-bold text-ink">
                  {formatCurrency(bill.subtotal, { unit: 'code' })}
                </dd>
              </div>
              <DeliveryFee
                amount={bill.deliveryFee}
                variant="row"
                showIcon
                note={bill.deliveryFeeLabel}
              />
              <div className="my-4 border-t border-dashed border-line" />
              <div className="flex items-end justify-between">
                <dt className="text-base font-black text-ink">Total / الإجمالي</dt>
                <dd dir="ltr" className="text-2xl font-black tracking-tight text-brand">
                  {bill.totalAmount} <span className="text-sm font-bold">{CURRENCY.code}</span>
                </dd>
              </div>
            </dl>
          )}
        </section>

        {submit.error && (
          <div
            className="mt-5 flex items-start gap-2 rounded-xl bg-danger-tint p-4 text-sm font-semibold text-danger-ink"
            aria-live="assertive"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              {submit.error.message}
              {submit.error.details.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs font-medium" aria-label="Validation details">
                  {submit.error.details.map((detail) => (
                    <li key={`${detail.path}:${detail.message}`}>
                      {detail.path ? `${detail.path}: ` : ''}{detail.message}
                    </li>
                  ))}
                </ul>
              )}
              {submit.error.isAuthError && (
                <span className="mt-1 block text-xs font-medium">
                  انتهت الجلسة، سجّل الدخول من جديد <span dir="ltr">/ Session expired, sign in again</span>
                </span>
              )}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={!canSubmit}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-base font-black text-white shadow-raised transition hover:bg-brand-dark focus:outline-none focus:ring-4 focus:ring-brand-tint active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submit.pending ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
          <span>Place Order / اطلب الآن</span>
        </button>
        <p className="mt-3 text-center text-xs text-ink-subtle">
          Secure checkout · الدفع عند الاستلام
        </p>

        <button
          type="button"
          onClick={auth.signOut}
          className="mx-auto mt-6 flex items-center gap-1.5 text-xs font-bold text-ink-subtle transition hover:text-danger-ink"
        >
          <LogOut size={13} />
          {auth.user.name} — تسجيل الخروج <span dir="ltr">/ Sign out</span>
        </button>
      </main>

      <BottomTabs activeTab="orders" />
    </div>
  );
};

export default CartCheckoutSummary;
