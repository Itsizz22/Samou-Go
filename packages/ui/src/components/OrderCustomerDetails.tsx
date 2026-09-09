import type { OrderSummary } from '@samou-go/shared-types';
/** Staff-only order context; data is scoped by the API's order-list authorization. */
export function OrderCustomerDetails({ order, showDestination = false }: { order: Pick<OrderSummary, 'customerContact' | 'deliveryDestination'>; showDestination?: boolean }) {
  const contact = order.customerContact;
  const destination = order.deliveryDestination;
  if (!contact && !(showDestination && destination)) return null;
  return <section dir="rtl" aria-label="بيانات الزبون" className="my-3 space-y-2 rounded-xl border border-line bg-canvas p-3 text-start text-sm text-ink">
    {contact && <>
      <p className="wrap-break-word"><span className="text-ink-muted">الزبون: </span><strong>{contact.name}</strong></p>
      <div className="flex flex-wrap items-center gap-2"><span className="text-ink-muted">رقم الهاتف:</span><a dir="ltr" href={`tel:${contact.phone}`} className="inline-flex min-h-11 items-center font-bold text-brand underline underline-offset-4">{contact.phone}</a></div>
    </>}
    {showDestination && destination && <>
      <p><span className="text-ink-muted">المنطقة: </span><strong>{destination.zoneNameAr || 'لم تُحدد منطقة لهذا الطلب'}</strong></p>
      <p className="whitespace-pre-wrap wrap-break-word"><span className="text-ink-muted">العنوان: </span>{destination.address || 'لم يُدخل عنوان'}</p>
      {destination.landmark && <p className="whitespace-pre-wrap wrap-break-word"><span className="text-ink-muted">وصف إضافي: </span>{destination.landmark}</p>}
    </>}
  </section>;
}
