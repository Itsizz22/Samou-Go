import { SignInGate, useAuth, useOrders } from '@/hooks/useApi';
import { Loader2, Package, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '@/components/ScreenShell';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@samou-go/shared-types';

/**
 * Samou' Go — `/orders`.
 *
 * The signed-in customer's recent orders. Sign-in is enforced client-side: an
 * anonymous visitor sees the gate instead of an empty state.
 */
export function OrdersScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const orders = useOrders({ pageSize: 20 }, { enabled: Boolean(auth.user) });

  const status = (state: OrderStatus) => ORDER_STATUS_LABELS[state]?.ar ?? state;

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
            orders.data?.items.map(order => (
              <article
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="rounded-2xl border border-line bg-surface p-4 shadow-card transition active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-end">
                    <h3 className="text-sm font-extrabold">{order.storeNameAr}</h3>
                    <p className="mt-0.5 text-[11px] text-ink-muted" dir="ltr">
                      {order.orderNumber}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-bold text-brand-dark">
                    {status(order.status)}
                  </span>
                </div>
              </article>
            ))
          )}
        </section>
      )}
    </ScreenShell>
  );
}
