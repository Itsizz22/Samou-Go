/**
 * `/cart` — the live basket: line items, quantities, and a display-only total.
 *
 * The server is the only money authority — this screen's subtotal/fee are
 * derived locally for a fast render, but checkout re-quotes via `quoteOrder`
 * before the customer commits. Totals shown here are therefore "estimate",
 * matching what the server will confirm.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Minus, Plus, RefreshCw, ShoppingBag, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/components/CartProvider';
import { formatCurrency, calculateDeliveryFee, DEFAULT_DELIVERY_FEE_CONFIG, isFreeDelivery, FREE_DELIVERY_LABEL, deliveryFeeLabel } from '@/lib/delivery';
import { hapticTap } from '@/lib/haptics';
import { PageTransition } from '@/components/PageTransition';
import { SkeletonGrid, ProductRowSkeleton } from '@/components/Skeleton';

export function CartScreen() {
  const cart = useCart();
  const navigate = useNavigate();

  const deliveryFee = calculateDeliveryFee(cart.itemCount, DEFAULT_DELIVERY_FEE_CONFIG);
  const total = cart.subtotal + deliveryFee;
  const deliveryFree = isFreeDelivery(deliveryFee);

  return (
    <PageTransition>
      <main className="min-h-screen bg-canvas pb-28 text-ink">
        <header className="safe-top bg-brand px-5 pb-4 pt-4 text-white">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <button
              type="button"
              aria-label="رجوع / Back"
              onClick={() => navigate(-1)}
              className="rounded-full p-2 transition hover:bg-surface/15 active:scale-95"
            >
              <ArrowRight size={22} className="rtl:rotate-180" />
            </button>
            <div className="flex-1 text-end">
              <h1 className="text-lg font-extrabold">سلة المشتريات</h1>
              <p className="text-[11px] text-white/80" dir="ltr">
                Your cart
              </p>
            </div>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">
              {cart.itemCount}
            </span>
          </div>
        </header>

        <div className="mx-auto max-w-md px-5 pt-6">
          {cart.lines.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-surface text-brand">
                <ShoppingBag size={24} />
              </span>
              <h2 className="mt-3 text-sm font-extrabold">سلتك فارغة</h2>
              <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
                Your cart is empty
              </p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn-primary mt-5 w-full justify-center"
              >
                تصفح المتاجر <span dir="ltr">Browse stores</span>
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <AnimatePresence>
                  {cart.lines.map((line) => (
                    <motion.article
                      key={line.productId}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -40 }}
                      className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card"
                    >
                      {line.product.imageUrl ? (
                        <img
                          src={line.product.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-14 w-14 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-sm font-black text-brand-dark">
                          {line.product.nameAr.slice(0, 2)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1 text-end">
                        <h3 className="truncate text-sm font-extrabold">{line.product.nameAr}</h3>
                        <p className="mt-0.5 text-xs font-bold text-brand-dark" dir="ltr">
                          {formatCurrency(line.product.price)}
                        </p>
                        <input
                          value={line.note}
                          onChange={(event) => cart.setNote(line.productId, event.target.value.slice(0, 500))}
                          placeholder="ملاحظة للصنف / Item note"
                          aria-label={`Item note for ${line.product.nameAr}`}
                          className="mt-2 w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-micro text-ink outline-none focus:border-brand"
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-2 rounded-full bg-brand px-1.5 py-1 text-white">
                        <button
                          type="button"
                          aria-label="إنقاص / Decrease"
                          onClick={() => {
                            cart.setQuantity(line.productId, line.quantity - 1);
                            void hapticTap();
                          }}
                          className="rounded-full p-2 transition active:scale-90"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="min-w-[18px] text-center text-xs font-bold">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="زيادة / Increase"
                          onClick={() => {
                            cart.setQuantity(line.productId, line.quantity + 1);
                            void hapticTap();
                          }}
                          className="rounded-full p-2 transition active:scale-90"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label="حذف / Remove"
                        onClick={() => cart.removeItem(line.productId)}
                        className="shrink-0 rounded-full p-2 text-ink-muted transition hover:bg-danger-tint hover:text-danger-ink"
                      >
                        <Trash2 size={16} />
                      </button>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </div>

              <div className="mt-5 rounded-2xl bg-surface p-4 shadow-card">
                <div className="flex justify-between text-xs text-ink-muted">
                  <span>المجموع الفرعي</span>
                  <span dir="ltr" className="font-bold text-ink">{formatCurrency(cart.subtotal)}</span>
                </div>
                <div className="mt-2 flex justify-between text-xs text-ink-muted">
                  <span>{deliveryFeeLabel('both')}</span>
                  <span dir="ltr" className="font-bold text-brand-dark">
                    {deliveryFree
                      ? `${FREE_DELIVERY_LABEL.ar} / ${FREE_DELIVERY_LABEL.en}`
                      : formatCurrency(deliveryFee)}
                  </span>
                </div>
                <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
                  <span className="font-extrabold">الإجمالي</span>
                  <span dir="ltr" className="font-extrabold text-brand-dark">{formatCurrency(total)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/checkout')}
                className="btn-primary mt-5 w-full justify-center"
              >
                إتمام الطلب <span dir="ltr">Checkout</span>
              </button>
            </>
          )}
        </div>
      </main>
    </PageTransition>
  );
}

export function CartSkeleton() {
  return (
    <SkeletonGrid count={3} render={() => <ProductRowSkeleton />} />
  );
}
