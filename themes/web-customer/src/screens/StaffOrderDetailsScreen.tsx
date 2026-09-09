import { CaptainReservation, PreparationCountdown, PreparationTimeEditor } from '@samou-go/api-client';
import { Link, useParams } from 'react-router-dom';
import { ORDER_STATUS_LABELS } from '@samou-go/shared-types';
import { OrderCustomerDetails } from '@samou-go/ui';
import { useAuth, useOrder } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/delivery';

/** Notification destination for staff; API enforces store/captain ownership. */
export function StaffOrderDetailsScreen() {
  const { orderId = '' } = useParams();
  const auth = useAuth();
  const order = useOrder(orderId, { pollMs: 10000, stopWhen: value => value?.status === 'DELIVERED' || value?.status === 'CANCELLED' });
  const home = auth.user?.role === 'CAPTAIN' ? '/captain/dashboard' : '/store-manager/orders';
  const data = order.data;
  return <main dir="rtl" className="min-h-svh bg-canvas px-5 py-6 text-ink">
    <div className="mx-auto max-w-md space-y-4">
      <header className="flex items-center justify-between gap-3"><h1 className="text-lg font-extrabold">تفاصيل الطلب</h1><Link to={home} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-bold text-brand">إدارة الطلبات</Link></header>
      {order.loading && <p role="status">جارٍ تحميل الطلب…</p>}
      {order.error && <div role="alert" className="rounded-2xl bg-surface p-4"><p>تعذر فتح الطلب. تحقق من صلاحية حسابك والاتصال.</p><button onClick={order.refresh} className="min-h-11 text-brand">إعادة المحاولة</button></div>}
      {data && <article className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <div><h2 dir="ltr" className="text-start text-xl font-extrabold">{data.orderNumber}</h2><p className="mt-2 font-bold">{data.store.nameAr}</p><p className="mt-2 text-sm text-brand">{ORDER_STATUS_LABELS[data.status].ar}</p></div>
        <PreparationCountdown order={data} />
        {auth.user?.role === "CAPTAIN" ? <CaptainReservation order={data} captainId={auth.user.id} onReserved={() => { void order.refresh(); }} /> : <PreparationTimeEditor order={data} />}
        <OrderCustomerDetails showDestination order={{ customerContact: data.customer.phone ? { name: data.customer.name, phone: data.customer.phone } : null, deliveryDestination: { zoneNameAr: data.deliveryZone?.nameAr ?? null, address: data.customerAddressText || "يظهر العنوان بعد حجز التوصيل", landmark: data.addressNote } }} />
        {data.store.phone && <a href={`tel:${data.store.phone}`} className="inline-flex min-h-11 items-center font-bold text-brand">الاتصال بالمتجر</a>}
        <ul className="divide-y divide-line">{data.items.map(item => <li key={item.id} className="space-y-2 py-3"><div className="flex justify-between gap-3"><strong>{item.offerTitle || item.product.nameAr}</strong><span dir="ltr">× {item.quantity}</span></div>{item.selectedOptions?.map(option => <p key={option.id} className="text-sm text-ink-muted">{option.name}</p>)}{item.note && <p className="text-sm text-ink-muted">{item.note}</p>}</li>)}</ul>
        <p className="flex justify-between font-bold"><span>قيمة المنتجات</span><span dir="ltr">{formatCurrency(data.subtotal)}</span></p>
        {data.orderNote && <p className="whitespace-pre-wrap rounded-xl bg-canvas p-3 text-sm">{data.orderNote}</p>}
      </article>}
    </div>
  </main>;
}
