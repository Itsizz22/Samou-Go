import { getOverdueOrders, useResource } from '@samou-go/api-client';
import { formatWhatsAppLink } from '@samou-go/shared-types';
export function OverdueOrdersPanel() {
  const resource = useResource('admin:overdue-orders', getOverdueOrders, { pollMs: 15000 });
  return (
    <section
      className="space-y-3 rounded-2xl border border-line bg-surface p-4"
      aria-label="طلبات تنتظر قبول المتجر"
    >
      <h3 className="font-bold">
        طلبات تنتظر قبول المتجر أكثر من 5 دقائق {resource.data ? `(${resource.data.total})` : ''}
      </h3>
      {resource.error ? (
        <p role="status">تعذر تحديث الطلبات. ستتم إعادة المحاولة تلقائيًا.</p>
      ) : resource.loading && !resource.data ? (
        <p>جارٍ التحقق…</p>
      ) : !resource.data?.total ? (
        <p className="text-sm text-ink-muted">لا توجد طلبات متأخرة في القبول.</p>
      ) : null}
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {resource.data?.items.map(order => (
          <li
            key={order.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"
          >
            <div className="flex-1">
              <p className="font-bold">{order.store.nameAr}</p>
              <p className="text-sm">
                <span dir="ltr">{order.orderNumber}</span> · ينتظر{' '}
                {Math.max(5, Math.floor((Date.now() - Date.parse(order.createdAt)) / 60000))} دقيقة
              </p>
            </div>
            {order.store.phone && (
              <>
                <a
                  className="flex min-h-11 items-center rounded-xl bg-brand px-3 text-white"
                  href={`tel:${order.store.phone}`}
                >
                  اتصال بالمتجر
                </a>
                <a
                  className="flex min-h-11 items-center text-brand"
                  href={formatWhatsAppLink(order.store.phone)}
                  target="_blank"
                  rel="noreferrer"
                >
                  واتساب
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
      {(resource.data?.total ?? 0) > 50 && (
        <p className="text-sm">
          تُعرض أقدم 50 حالة؛ العدد الإجمالي أعلاه يشمل جميع الطلبات المتأخرة.
        </p>
      )}
    </section>
  );
}
