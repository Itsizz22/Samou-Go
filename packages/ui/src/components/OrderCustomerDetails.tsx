import { OrderContactCard } from './OrderContactCard';
import type { OrderSummary } from '@samou-go/shared-types';
/** Staff-only order context; data is scoped by the API's order-list authorization. */
export function OrderCustomerDetails({ order, showDestination = false }: { order: Pick<OrderSummary, 'customerContact' | 'deliveryDestination' | 'storeContact'>; showDestination?: boolean }) {
  const contact = order.customerContact;
  const destination = order.deliveryDestination;
  if (!contact && !order.storeContact && !(showDestination && destination)) return null;
  return <section dir="rtl" aria-label="بيانات الزبون" className="my-3 space-y-2 rounded-xl border border-line bg-canvas p-3 text-start text-sm text-ink">
    {contact && <OrderContactCard title="الزبون" contact={contact} />}
    {order.storeContact && <OrderContactCard title="المتجر" contact={order.storeContact} />}
    {showDestination && destination && <>
      <p><span className="text-ink-muted">المنطقة: </span><strong>{destination.zoneNameAr || 'لم تُحدد منطقة لهذا الطلب'}</strong></p>
      <p className="whitespace-pre-wrap wrap-break-word"><span className="text-ink-muted">العنوان: </span>{destination.address || 'لم يُدخل عنوان'}</p>
      {destination.landmark && <p className="whitespace-pre-wrap wrap-break-word"><span className="text-ink-muted">وصف إضافي: </span>{destination.landmark}</p>}
    </>}
  </section>;
}
