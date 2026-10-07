import { useState } from 'react';
import { OrderRecord, HandoffScanner, updateOrderStatus } from '@samou-go/api-client';
import { StoreCaptainContact } from '@samou-go/api-client';
import { OrderChat } from '@samou-go/api-client';
import { CaptainReservation, PreparationCountdown, PreparationTimeEditor } from '@samou-go/api-client';
import { Link, useParams } from 'react-router-dom';
import { ORDER_STATUS_LABELS } from '@samou-go/shared-types';
import { OrderCustomerDetails } from '@samou-go/ui';
import { useAuth, useOrder } from '@/hooks/useApi';


/** Notification destination for staff; API enforces store/captain ownership. */
export function StaffOrderDetailsScreen() {
  const { orderId = '' } = useParams();
  const auth = useAuth();
  const [scan, setScan] = useState<'pickup' | 'delivery' | null>(null);
  const order = useOrder(orderId, { pollMs: 10000, stopWhen: value => value?.status === 'DELIVERED' || value?.status === 'CANCELLED' });
  const home = auth.user?.role === 'CAPTAIN' ? '/captain/dashboard' : '/store-manager/orders';
  const data = order.error ? null : order.data;
  const unavailable = order.error?.status === 403 || order.error?.status === 404;
  return <main dir="rtl" className="min-h-svh bg-canvas px-5 py-6 text-ink">
    <div className="mx-auto max-w-md space-y-4">
      <header className="flex items-center justify-between gap-3"><h1 className="text-lg font-extrabold">تفاصيل الطلب</h1><Link to={home} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-bold text-brand">إدارة الطلبات</Link></header>
      {order.loading && <p role="status">جارٍ تحميل الطلب…</p>}
      {order.error && <div role="alert" className="rounded-2xl bg-surface p-4"><p>{unavailable ? 'هذا الطلب لم يعد متاحًا لحسابك. قد انتهى عرض التوصيل أو استلمه كابتن آخر.' : 'تعذر الاتصال لتحميل الطلب.'}</p>{unavailable ? <Link to={home} className="inline-flex min-h-11 items-center text-brand">عرض الطلبات الحالية</Link> : <button onClick={order.refresh} className="min-h-11 text-brand">إعادة المحاولة</button>}</div>}
      {data && <article className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <div><h2 dir="ltr" className="text-start text-xl font-extrabold">{data.orderNumber}</h2><p className="mt-2 font-bold">{data.store.nameAr}</p><p className="mt-2 text-sm text-brand">{ORDER_STATUS_LABELS[data.status].ar}</p></div>
        <PreparationCountdown order={data} />
        {auth.user?.role === "CAPTAIN" ? <CaptainReservation order={data} captainId={auth.user.id} onReserved={() => { void order.refresh(); }} /> : <PreparationTimeEditor order={data} />}
        <OrderCustomerDetails showDestination showStore={auth.user?.role !== "STORE_MANAGER"} order={{ storeContact: { name: data.store.nameAr, phone: data.store.phone, whatsappNumber: data.store.whatsappNumber }, customerContact: data.customer.phone ? { name: data.customer.name, phone: data.customer.phone, whatsappNumber: data.customer.whatsappNumber } : null, deliveryDestination: { zoneNameAr: data.deliveryZone?.nameAr ?? null, address: data.customerAddressText || "يظهر العنوان بعد حجز التوصيل", landmark: data.addressNote } }} />

        {auth.user?.role === "STORE_MANAGER" && data.fulfillmentType !== "PICKUP" && <StoreCaptainContact key={data.captainId} orderId={data.id} captainId={data.captainId} />}
        {data.customer.phone && <OrderChat orderId={data.id} />}
        <OrderRecord order={data} store={auth.user?.role === 'STORE_MANAGER'} />
        {auth.user?.role === 'CAPTAIN' && data.fulfillmentType === 'DELIVERY' &&
          ((data.status === 'READY_FOR_PICKUP' && (!data.captainId || data.captainId === auth.user.id)) || (data.status === 'ON_THE_WAY' && data.captainId === auth.user.id)) &&
          <button className="min-h-12 w-full rounded-xl bg-brand px-4 font-bold text-white" onClick={() => setScan(data.status === 'READY_FOR_PICKUP' ? 'pickup' : 'delivery')}>مسح QR لتأكيد {data.status === 'READY_FOR_PICKUP' ? 'الاستلام من المتجر' : 'التسليم للزبون'}</button>}
        {scan && <HandoffScanner orderId={data.id} stage={scan} onClose={() => setScan(null)} onScan={async qrToken => {
          await updateOrderStatus(data.id, { status: scan === 'pickup' ? 'ON_THE_WAY' : 'DELIVERED', qrToken });
          setScan(null); void order.refresh();
        }} />}
      </article>}
    </div>
  </main>;
}
