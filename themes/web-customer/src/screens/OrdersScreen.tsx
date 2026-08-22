import { useMemo, useState } from 'react';
import { SignInGate, useAuth, useOrders } from '@/hooks/useApi';
import { Loader2, Package, Phone, RefreshCw, RotateCcw, StickyNote, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { reorderOrder } from '@samou-go/api-client';
import { Badge, useLanguage } from '@samou-go/ui';
import { ScreenShell } from '@/components/ScreenShell';
import { useCart } from '@/components/CartProvider';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES, type OrderStatus, type OrderSummary } from '@samou-go/shared-types';

/**
 * Samou' Go — `/orders`.
 *
 * The signed-in customer's recent orders. Sign-in is enforced client-side: an
 * anonymous visitor sees the gate instead of an empty state.
 */
export function OrdersScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const cart = useCart();
  const { t } = useLanguage();
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const orders = useOrders({ pageSize: 20 }, { enabled: Boolean(auth.user) });

  const status = (state: OrderStatus) => ORDER_STATUS_LABELS[state]?.ar ?? state;

  /** Group orders by cartCheckoutId for multi-store checkout display. */
  const groupedOrders = useMemo(() => {
    const items = orders.data?.items ?? [];
    const groups = new Map<string, OrderSummary[]>();
    for (const order of items) {
      const key = order.cartCheckoutId ?? order.id;
      const arr = groups.get(key) ?? [];
      arr.push(order);
      groups.set(key, arr);
    }
    // Render: each group is a row, sorted by most recent first.
    const rows: { key: string; orders: OrderSummary[]; isMulti: boolean }[] = [];
    for (const [key, ords] of groups) {
      rows.push({ key, orders: ords, isMulti: ords.length > 1 });
    }
    return rows;
  }, [orders.data]);

  return (
    <ScreenShell title="الطلبات" subtitle="Orders">
      {!auth.ready ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-brand" aria-label="Loading" />
        </div>
      ) : !auth.user ? (
        <SignInGate auth={auth} reasonAr="سجّل الدخول لعرض طلباتك" reasonEn="Sign in to see your orders" />
      ) : orders.loading && !orders.data ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-brand" aria-label="Loading" />
        </div>
      ) : (
        <section className="space-y-3" aria-live="polite">
          {orders.error ? (
            <div className="rounded-2xl border border-danger-tint bg-surface p-5 text-center shadow-card">
              <p className="text-sm font-extrabold">تعذّر تحميل الطلبات</p>
              <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
                Could not load orders
              </p>
              <p className="mt-2 text-xs text-ink-soft">{orders.error.message}</p>
              <button
                type="button"
                onClick={orders.refresh}
                disabled={orders.refreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
              >
                {orders.refreshing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                إعادة المحاولة <span dir="ltr">Retry</span>
              </button>
            </div>
          ) : (orders.data?.items ?? []).length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
                <Package size={22} />
              </span>
              <h2 className="mt-3 text-sm font-extrabold">لا توجد طلبات بعد</h2>
              <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
                No orders yet
              </p>
            </div>
          ) : (
            groupedOrders.map((row) => (
              row.isMulti ? (
                /* Multi-store checkout group */
                <article key={row.key} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Store size={14} className="text-brand" />
                      <span className="text-xs font-extrabold text-ink">{row.orders.length} {t('متاجر', 'stores')}</span>
                    </div>
                    <span className="text-[11px] text-ink-muted" dir="ltr">{row.orders[0].orderNumber}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {row.orders.map(o => (
                      <div key={o.id} className="flex items-center justify-between rounded-xl border border-line bg-canvas p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">{o.storeNameAr}</span>
                          <Badge tone={ORDER_STATUS_TONES[o.status]} dot>{status(o.status)}</Badge>
                        </div>
                        <button type="button" onClick={() => navigate(`/orders/${o.id}`)} className="text-[11px] font-bold text-brand">{t('التفاصيل', 'Details')}</button>
                      </div>
                    ))}
                  </div>
                </article>
              ) : (
                /* Single order */
                <article key={row.key} className="rounded-2xl border border-line bg-surface p-4 shadow-card transition active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-end">
                      <h3 className="text-sm font-extrabold">{row.orders[0].storeNameAr}</h3>
                      <p className="mt-0.5 text-[11px] text-ink-muted" dir="ltr">{row.orders[0].orderNumber}</p>
                    </div>
                    <Badge tone={ORDER_STATUS_TONES[row.orders[0].status]} dot>{status(row.orders[0].status)}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => navigate(`/orders/${row.orders[0].id}`)} className="rounded-xl border border-line py-2 text-xs font-bold text-ink-muted">التفاصيل <span dir="ltr">Details</span></button>
                    <button type="button" disabled={reorderingId === row.orders[0].id} onClick={async () => {
                      setReorderingId(row.orders[0].id);
                      try {
                        const result = await reorderOrder(row.orders[0].id);
                        cart.clear();
                        result.items.forEach((item) => cart.addItem(item.product, item.quantity, item.note, result.storeNameAr));
                        navigate('/cart');
                      } finally { setReorderingId(null); }
                    }} className="inline-flex items-center justify-center gap-1 rounded-xl bg-brand py-2 text-xs font-bold text-white disabled:opacity-60">
                      {reorderingId === row.orders[0].id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} إعادة الطلب <span dir="ltr">Reorder</span>
                    </button>
                  </div>
                  {row.orders[0].deliveryPreset && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-info-ink">
                      <Phone size={11} />
                      {t(row.orders[0].deliveryPreset === 'call_on_arrival' ? 'اتصل عند الوصول' : 'اترك عند الباب', row.orders[0].deliveryPreset === 'call_on_arrival' ? 'Call on arrival' : 'Leave at door')}
                    </p>
                  )}
                  {row.orders[0].orderNote && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-ink-muted">
                      <StickyNote size={11} className="mt-0.5 shrink-0 text-brand" />{row.orders[0].orderNote}
                    </p>
                  )}
                </article>
              )
            ))
          )}
        </section>
      )}
    </ScreenShell>
  );
}
