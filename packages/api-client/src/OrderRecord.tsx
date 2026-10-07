import { useState } from 'react';
import { ORDER_STATUS_LABELS, OrderStatus, type OrderDetail } from '@samou-go/shared-types';
import { useOrder, useOrders } from './useApi';
import { HandoffQr } from './HandoffQr';
const money = (value: number) => `${value.toFixed(2)} ₪`;
const date = (value: string) => new Date(value).toLocaleString('ar-PS');

export function OrderAmounts({ order, store = false }: { order: { totalAmount: number; deliveryFee: number; discount: number; subtotal?: number }; store?: boolean }) {
  const products = Math.round((order.totalAmount - order.deliveryFee) * 100) / 100;
  return <dl className="space-y-2 rounded-xl bg-canvas p-3 text-sm">
    <div className="flex justify-between gap-3"><dt>قيمة المنتجات</dt><dd dir="ltr">{money(order.subtotal ?? products + order.discount)}</dd></div>
    {order.discount > 0 && <div className="flex justify-between gap-3"><dt>الخصم</dt><dd dir="ltr">− {money(order.discount)}</dd></div>}
    {!store && <div className="flex justify-between gap-3"><dt>رسوم التوصيل</dt><dd dir="ltr">{money(order.deliveryFee)}</dd></div>}
    <div className="flex justify-between gap-3 border-t border-line pt-2 font-bold"><dt>{store ? 'قيمة الطلب دون التوصيل' : 'الإجمالي'}</dt><dd dir="ltr">{money(store ? products : order.totalAmount)}</dd></div>
  </dl>;
}

export function OrderRecord({ order, store = false }: { order: OrderDetail; store?: boolean }) {
  return <div className="space-y-4">
    <dl className="space-y-2 text-sm">
      <div><dt className="font-bold">تاريخ الطلب</dt><dd>{date(order.createdAt)}</dd></div>
      <div><dt className="font-bold">طريقة الاستلام</dt><dd>{order.fulfillmentType === 'PICKUP' ? 'استلام من المتجر' : 'توصيل'}</dd></div>
      {order.scheduledFor && <div><dt className="font-bold">الموعد المجدول</dt><dd>{date(order.scheduledFor)}</dd></div>}
      {order.customer.name && <div><dt className="font-bold">الزبون</dt><dd>{order.customer.name} <span dir="ltr">{order.customer.phone}</span></dd></div>}
      {order.customerAddressText && <div><dt className="font-bold">العنوان</dt><dd>{order.customerAddressText} {order.addressNote}</dd></div>}
      {order.captain && <div><dt className="font-bold">الكابتن</dt><dd>{order.captain.name} <span dir="ltr">{order.captain.phone}</span></dd></div>}
    </dl>
    <ul className="divide-y divide-line">{order.items.map(item => <li key={item.id} className="space-y-2 py-3">
      <div className="flex items-center justify-between gap-3">{item.product.imageUrl && <img src={item.product.imageUrl} alt="" className="size-14 rounded-xl object-cover" />}<strong>{item.offerTitle || item.product.nameAr}</strong><span dir="ltr">× {item.quantity}</span></div>
      <p className="text-sm">سعر الوحدة <span dir="ltr">{money(item.unitPrice)}</span> · المجموع <span dir="ltr">{money(item.totalPrice)}</span></p>
      {item.selectedOptions?.map(option => <p key={option.id} className="text-sm text-ink-muted">{option.name}</p>)}
      {item.note && <p className="whitespace-pre-wrap text-sm">{item.note}</p>}
    </li>)}</ul>
    <OrderAmounts order={order} store={store} />
    {order.voucher && <p className="text-sm">القسيمة: {order.voucher.labelAr} <span dir="ltr">{order.voucher.code}</span></p>}
    {order.orderNote && <p className="whitespace-pre-wrap rounded-xl bg-canvas p-3">{order.orderNote}</p>}
    {order.voiceNoteUrl && <audio controls src={order.voiceNoteUrl} className="w-full" />}
    {store && order.pickupQr && <HandoffQr value={order.pickupQr} title="رمز تسليم الطلب للكابتن" />}
    <section><h3 className="font-bold">سجل حالات الطلب</h3><ol className="mt-2 space-y-3">{order.statusHistory.map(entry => <li key={entry.id} className="border-s-2 border-brand ps-3 text-sm"><strong>{ORDER_STATUS_LABELS[entry.status].ar}</strong><p className="text-ink-muted">{date(entry.createdAt)}</p>{entry.note && <p className="whitespace-pre-wrap">{entry.note}</p>}</li>)}</ol></section>
  </div>;
}

export function StoreOrderHistory({ storeId }: { storeId: string }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [selected, setSelected] = useState<string | null>(null);
  const orders = useOrders({ storeId, page, pageSize: 20, ...(status ? { status } : {}) }, { pollMs: 10000 });
  const detail = useOrder(selected, { pollMs: 10000, stopWhen: order => order?.status === 'CANCELLED' || order?.status === 'DELIVERED' });
  if (selected) return <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
    <button className="min-h-11 font-bold text-brand" onClick={() => setSelected(null)}>العودة إلى سجل الطلبات</button>
    {detail.loading && <p role="status">جارٍ تحميل التفاصيل…</p>}
    {detail.error && <div role="alert">تعذر تحميل الطلب <button onClick={detail.refresh} className="min-h-11 text-brand">إعادة المحاولة</button></div>}
    {detail.data && <><h3 className="font-bold">{detail.data.orderNumber} · {ORDER_STATUS_LABELS[detail.data.status].ar}</h3><OrderRecord order={detail.data} store /></>}
  </section>;
  return <section className="mt-6 space-y-4" aria-label="سجل جميع الطلبات">
    <h3 className="text-lg font-bold">سجل جميع الطلبات</h3>
    <label className="flex items-center gap-3">الحالة<select value={status} onChange={event => { setStatus(event.target.value as OrderStatus | ''); setPage(1); }} className="min-h-11 rounded-xl border border-line bg-surface px-3"><option value="">كل الحالات</option>{Object.values(OrderStatus).map(value => <option key={value} value={value}>{ORDER_STATUS_LABELS[value].ar}</option>)}</select></label>
    {orders.loading && <p role="status">جارٍ التحميل…</p>}
    {orders.error && <p role="alert">تعذر تحميل السجل <button className="min-h-11 text-brand" onClick={orders.refresh}>إعادة المحاولة</button></p>}
    {orders.data?.items.map(order => <button key={order.id} onClick={() => setSelected(order.id)} className="block w-full space-y-2 rounded-2xl border border-line bg-surface p-4 text-start"><strong>{order.orderNumber} · {ORDER_STATUS_LABELS[order.status].ar}</strong><p className="text-sm text-ink-muted">{date(order.createdAt)}</p><p>{order.customerContact?.name} · <span dir="ltr">{money(order.totalAmount - order.deliveryFee)}</span></p><span className="text-sm font-bold text-brand">عرض التفاصيل كاملة</span></button>)}
    {!orders.loading && orders.data?.total === 0 && <p>لا توجد طلبات بهذه الحالة.</p>}
    <div className="flex items-center justify-between gap-3"><button disabled={page <= 1 || orders.loading} className="min-h-11 px-4 disabled:opacity-40" onClick={() => setPage(value => value - 1)}>السابق</button><span>{page}</span><button disabled={page * 20 >= (orders.data?.total ?? 0) || orders.loading} className="min-h-11 px-4 disabled:opacity-40" onClick={() => setPage(value => value + 1)}>التالي</button></div>
  </section>;
}
