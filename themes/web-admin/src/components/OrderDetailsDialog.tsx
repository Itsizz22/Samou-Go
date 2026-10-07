import { useEffect, useRef, type ReactNode } from 'react';
import { useOrder } from '@/hooks/useApi';
import { ORDER_STATUS_LABELS, type OrderDetail } from '@samou-go/shared-types';

const money = (value: number) => `${value.toFixed(2)} ₪`;
const date = (value: string) => new Intl.DateTimeFormat('ar-PS', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Hebron' }).format(new Date(value));

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-ink-muted">{label}</dt><dd className="mt-1 break-words font-semibold">{children ?? '—'}</dd></div>;
}

export function OrderDetailsContent({ order }: { order: OrderDetail }) {
  return <div className="space-y-6 p-5 text-sm" dir="rtl">
    <section aria-label="بيانات الطلب"><dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Field label="الحالة">{ORDER_STATUS_LABELS[order.status].ar}</Field>
      <Field label="نوع الطلب">{order.fulfillmentType === 'PICKUP' ? 'استلام من المحل' : 'توصيل'}</Field>
      <Field label="طريقة الدفع">{order.paymentMethod === 'COD' ? 'الدفع عند الاستلام' : order.paymentMethod}</Field>
      <Field label="وقت الطلب">{date(order.createdAt)}</Field>
      <Field label="آخر تحديث">{date(order.updatedAt)}</Field>
      <Field label="موعد الطلب المجدول">{order.scheduledFor ? date(order.scheduledFor) : 'غير مجدول'}</Field>
    </dl></section>
    <section className="border-t border-line pt-5"><h3 className="mb-3 font-extrabold">الزبون والمتجر والكابتن</h3><div className="grid gap-3 sm:grid-cols-3">
      {[{ label: 'الزبون', person: order.customer }, { label: 'المتجر', person: { ...order.store, name: order.store.nameAr } }, { label: 'الكابتن', person: order.captain }].map(({ label, person }) => <div key={label} className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-muted">{label}</p><p className="my-1 font-bold">{person?.name ?? 'لم يتم التعيين'}</p>{person?.phone && <a className="block text-brand underline" dir="ltr" href={`tel:${person.phone}`}>{person.phone}</a>}{person?.whatsappNumber && <p className="mt-1 text-xs">واتساب: <bdi dir="ltr">{person.whatsappNumber}</bdi></p>}</div>)}
    </div></section>
    <section className="border-t border-line pt-5"><h3 className="mb-3 font-extrabold">العنوان وتعليمات الطلب</h3><dl className="grid gap-4 sm:grid-cols-2">
      <Field label="عنوان الزبون">{order.customerAddressText || 'غير محدد'}</Field>
      <Field label="ملاحظات العنوان">{order.addressNote}</Field>
      <Field label="منطقة التوصيل">{order.deliveryZone?.nameAr ?? 'غير محددة'}</Field>
      <Field label="تعليمات التسليم">{order.deliveryPreset === 'call_on_arrival' ? 'الاتصال عند الوصول' : order.deliveryPreset === 'leave_at_door' ? 'اتركه عند الباب' : order.deliveryPreset}</Field>
      <Field label="ملاحظات الطلب">{order.orderNote}</Field>
      <Field label="عند عدم توفر صنف">{order.unavailableAction === 'REMOVE' ? 'حذف الصنف' : order.unavailableAction === 'SUGGEST' ? 'اقتراح بديل' : order.unavailableAction === 'CONTACT' ? 'التواصل مع الزبون' : 'غير محدد'}</Field>
    </dl>{order.latitude != null && order.longitude != null && <a className="mt-3 inline-block text-brand underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${order.latitude},${order.longitude}`}>فتح موقع التوصيل على الخريطة</a>}
    {order.voiceNoteUrl && <div className="mt-4"><p className="mb-2 font-semibold">الملاحظة الصوتية</p><audio controls preload="none" src={order.voiceNoteUrl} className="w-full" /></div>}
    {order.changeProposal && <details className="mt-3"><summary>تعديل مقترح على الطلب</summary><pre className="whitespace-pre-wrap break-all text-xs">{order.changeProposal}</pre></details>}
    </section>
    <section className="border-t border-line pt-5"><h3 className="mb-3 font-extrabold">الأصناف والإضافات</h3><ul className="divide-y divide-line">
      {order.items.map(item => <li key={item.id} className="py-4"><div className="flex gap-3">
        {item.product?.imageUrl && <img src={item.product.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />}
        <div className="min-w-0 flex-1"><p className="font-bold">{item.offerTitle || item.product?.nameAr || 'صنف غير متاح'}</p>{item.isOfferItem && <p className="text-xs text-brand">عرض</p>}<p className="mt-1 text-xs text-ink-muted">الكمية <bdi>{item.quantity}</bdi> × سعر الوحدة <bdi dir="ltr">{money(item.unitPrice)}</bdi></p>
        {!!item.selectedOptions?.length && <ul className="mt-2 space-y-1 text-xs">{item.selectedOptions.map((option, index) => <li key={`${option.id}-${index}`}>{option.name} <bdi dir="ltr">({money(option.priceDelta)})</bdi></li>)}</ul>}
        {item.note && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-canvas p-2">ملاحظة: {item.note}</p>}</div>
        <bdi dir="ltr" className="shrink-0 font-bold">{money(item.totalPrice)}</bdi></div></li>)}
    </ul></section>
    <section className="rounded-xl bg-canvas p-4"><h3 className="mb-3 font-extrabold">تفصيل المبلغ</h3><dl className="space-y-2">
      {[['مجموع الأصناف', order.subtotal], ['رسوم التوصيل', order.deliveryFee], ['الخصم', -order.discount], ['الإجمالي', order.totalAmount]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd dir="ltr" className="font-bold">{money(Number(value))}</dd></div>)}
      {order.voucher && <Field label="كوبون الخصم">{order.voucher.labelAr} — <bdi>{order.voucher.code}</bdi></Field>}
      {order.isCaptainPriced && <Field label="سعر التوصيل المقترح من الكابتن">{order.driverQuotedFee != null ? money(order.driverQuotedFee) : 'لم يحدد'} — {order.feeApprovalStatus === 'PENDING_CUSTOMER_ACCEPTANCE' ? 'بانتظار موافقة الزبون' : 'معتمد'}</Field>}
    </dl></section>
    <section><h3 className="mb-3 font-extrabold">التحضير والتسليم</h3><dl className="grid gap-4 sm:grid-cols-3">
      <Field label="مدة التحضير">{order.estimatedPrepMinutes != null ? `${order.estimatedPrepMinutes} دقيقة` : 'غير محددة'}</Field>
      <Field label="الجاهزية المتوقعة">{order.estimatedReadyAt ? date(order.estimatedReadyAt) : 'غير محددة'}</Field>
      <Field label="تم التجهيز">{order.preparedAt ? date(order.preparedAt) : '—'}</Field>
      <Field label="رمز استلام الكابتن">{order.captainHandoffCode && <bdi dir="ltr">{order.captainHandoffCode}</bdi>}</Field>
      <Field label="رمز تسليم الزبون">{order.deliveryPin && <bdi dir="ltr">{order.deliveryPin}</bdi>}</Field>
    </dl></section>
    <section className="border-t border-line pt-5"><h3 className="mb-3 font-extrabold">سجل حالة الطلب</h3><ol className="space-y-3">{[...order.statusHistory].sort((a,b) => a.createdAt.localeCompare(b.createdAt)).map(entry => <li key={entry.id} className="border-s-2 border-brand ps-3"><p className="font-bold">{ORDER_STATUS_LABELS[entry.status].ar}</p><time className="text-xs text-ink-muted">{date(entry.createdAt)}</time>{entry.note && <p className="mt-1 whitespace-pre-wrap">{entry.note}</p>}</li>)}</ol></section>
  </div>;
}

export function OrderDetailsDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const order = useOrder(orderId, { pollMs: 10000 });
  useEffect(() => { const dialog = ref.current; const active = document.activeElement; dialog?.showModal(); const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { dialog?.close(); document.body.style.overflow = old; if (active instanceof HTMLElement) active.focus(); }; }, []);
  return <dialog ref={ref} onCancel={onClose} aria-labelledby="order-detail-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-black/50" dir="rtl">
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface p-4"><h2 id="order-detail-title" className="font-extrabold">تفاصيل الطلب <bdi dir="ltr">{order.data?.orderNumber}</bdi></h2><button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-2">إغلاق</button></header>
    {order.loading && !order.data && <p role="status" className="p-6">جارٍ تحميل تفاصيل الطلب…</p>}
    {order.error && <div role="alert" className="p-4"><p>تعذّر تحديث تفاصيل الطلب: {order.error.message}</p><button type="button" className="mt-2 text-brand underline" onClick={() => void order.reload()}>إعادة المحاولة</button></div>}
    {order.data && <OrderDetailsContent order={order.data} />}
  </dialog>;
}
