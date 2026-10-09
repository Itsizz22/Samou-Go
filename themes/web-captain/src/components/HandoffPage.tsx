import { useRef, useState } from 'react';
import { SignInGate, updateOrderStatus, useAuth, useOrders } from '@samou-go/api-client';
import { ORDER_STATUS_LABELS, OrderStatus, UserRole, type OrderSummary } from '@samou-go/shared-types';
import { OrderCustomerDetails } from '@samou-go/ui';

export function HandoffPage() {
  const auth = useAuth({ allowedRoles: [UserRole.CAPTAIN] });
  const [page, setPage] = useState(1);
  const orders = useOrders({ activeOnly: true, captainId: auth.user?.id, page, pageSize: 50 }, { enabled: Boolean(auth.user), pollMs: 10000 });
  const [selection, setSelection] = useState<OrderSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const money = (value: number) => `${value.toFixed(2)} ₪`;
  async function confirm() {
    if (!selection || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await updateOrderStatus(selection.id, { status: selection.status === OrderStatus.READY_FOR_PICKUP ? OrderStatus.ON_THE_WAY : OrderStatus.DELIVERED, manualHandoff: true });
      setMessage(selection.status === OrderStatus.READY_FOR_PICKUP ? 'تم تأكيد الاستلام من المتجر' : 'تم تأكيد التسليم وتحصيل المبلغ');
      setSelection(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر التأكيد. حدّث الطلب وحاول مجددًا.');
      setSelection(null);
    } finally {
      await orders.reload(); lock.current = false; setBusy(false);
    }
  }
  if (!auth.ready) return <main dir="rtl" className="p-6">جارٍ التحقق من الحساب…</main>;
  if (!auth.user) return <SignInGate auth={auth} reasonAr="دخول الكابتن لتأكيد الاستلام والتسليم" reasonEn="Captain handoff confirmation" />;
  if (auth.user.role !== UserRole.CAPTAIN) return <main dir="rtl" className="p-6">هذه الصفحة مخصصة للكباتن.</main>;
  const items = orders.error ? [] : (orders.data?.items ?? []).filter(order => order.captainId === auth.user?.id && order.fulfillmentType === 'DELIVERY');
  return <main dir="rtl" className="min-h-svh bg-canvas px-4 py-6 text-ink"><div className="mx-auto max-w-md space-y-4">
    <header className="space-y-2"><p className="text-sm text-brand">سموع كويك · {auth.user.name}</p><h1 className="text-xl font-extrabold">تأكيد الاستلام والتسليم</h1><p className="text-sm text-ink-muted">طلباتك المعيّنة لك. أكّد العملية بعد إتمامها فقط.</p><div className="flex gap-4"><button className="min-h-11 font-bold text-brand" disabled={busy || orders.refreshing} onClick={() => void orders.reload()}>تحديث الطلبات</button><button className="min-h-11 text-ink-muted" disabled={busy} onClick={() => void auth.signOut()}>تسجيل الخروج</button></div></header>
    {message && <p role="status" className="rounded-xl bg-brand-tint p-4 text-brand-dark">{message}</p>}
    {(error || orders.error) && <p role="alert" className="rounded-xl border border-line p-4">{error || 'تعذر تحميل الطلبات. اضغط تحديث الطلبات.'}</p>}
    {orders.loading && <p role="status">جارٍ تحميل الطلبات…</p>}
    {!orders.loading && !orders.error && !items.length && <p className="rounded-xl bg-surface p-5">لا توجد طلبات نشطة معيّنة لك. احجز الطلب من التطبيق ثم حدّث هذه الصفحة.</p>}
    {items.map(order => <article key={order.id} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div className="flex justify-between gap-3"><h2 className="font-extrabold">{order.storeNameAr}</h2><bdi>{order.orderNumber}</bdi></div>
      <p className="font-bold text-brand">{ORDER_STATUS_LABELS[order.status].ar}</p>
      <OrderCustomerDetails order={order} showDestination showStore />
      <dl className="space-y-2 text-sm"><div className="flex justify-between"><dt>قيمة الطلب بعد الخصم</dt><dd dir="ltr">{money(order.totalAmount - order.deliveryFee)}</dd></div><div className="flex justify-between"><dt>رسوم التوصيل</dt><dd dir="ltr">{money(order.deliveryFee)}</dd></div><div className="flex justify-between font-extrabold"><dt>المبلغ المطلوب من الزبون</dt><dd dir="ltr">{money(order.totalAmount)}</dd></div></dl>
      {(order.status === OrderStatus.READY_FOR_PICKUP || order.status === OrderStatus.ON_THE_WAY) && <button disabled={busy || Boolean(orders.error)} className="min-h-12 w-full rounded-xl bg-brand px-4 py-3 font-bold text-white disabled:opacity-50" onClick={() => {setError(''); setSelection(order);}}>{order.status === OrderStatus.READY_FOR_PICKUP ? 'استلمت الطلب من المتجر' : 'سلّمت الطلب واستلمت المبلغ'}</button>}
    </article>)}
    <div className="flex justify-between"><button className="min-h-11 text-brand" disabled={page === 1 || busy} onClick={() => setPage(p => p - 1)}>السابق</button><span>{page}</span><button className="min-h-11 text-brand" disabled={items.length < 50 || busy} onClick={() => setPage(p => p + 1)}>التالي</button></div>
    {selection && <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><section className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-5"><h2 id="confirm-title" className="text-lg font-bold">{selection.status === OrderStatus.READY_FOR_PICKUP ? 'تأكيد استلام الطلب من المتجر' : 'تأكيد تسليم الطلب وتحصيل المبلغ'}</h2><p>{selection.storeNameAr} · <bdi>{selection.orderNumber}</bdi></p>{selection.status === OrderStatus.ON_THE_WAY && <p>أؤكد تسليم الطلب للزبون واستلام <bdi>{money(selection.totalAmount)}</bdi>.</p>}<div className="flex gap-3"><button disabled={busy} onClick={() => void confirm()} className="min-h-12 flex-1 rounded-xl bg-brand px-4 font-bold text-white">{busy ? 'جارٍ التأكيد…' : 'تأكيد'}</button><button disabled={busy} onClick={() => setSelection(null)} className="min-h-12 flex-1 rounded-xl border border-line px-4">رجوع</button></div></section></div>}
  </div></main>;
}
