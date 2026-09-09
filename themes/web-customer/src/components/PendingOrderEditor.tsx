import { useState } from 'react';
import { editPendingOrder } from '@samou-go/api-client';
import type { OrderDetail } from '@samou-go/shared-types';
import { formatCurrency } from '@/lib/delivery';
export function PendingOrderEditor({
  order,
  onSaved,
}: {
  order: OrderDetail;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(() =>
    order.items.map(i => ({ id: i.id, quantity: i.quantity, note: i.note ?? '' }))
  );
  const [note, setNote] = useState(order.orderNote ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (order.status !== 'PENDING') return null;
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card">
      <button
        type="button"
        className="min-h-11 font-bold text-brand"
        onClick={() => setOpen(!open)}
      >
        تعديل الكميات والملاحظات
      </button>
      <p className="text-xs text-ink-muted">
        متاح حتى قبول المتجر. ضع الكمية صفرًا لحذف صنف. يُعاد احتساب الخصم حسب شروط الكوبون.
      </p>
      {open && (
        <form
          className="mt-3 space-y-3"
          onSubmit={async e => {
            e.preventDefault();
            if (pending) return;
            setPending(true);
            setError('');
            try {
              await editPendingOrder(order.id, {
                updatedAt: order.updatedAt,
                items,
                orderNote: note,
              });
              setOpen(false);
              onSaved();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'تعذر التعديل');
            } finally {
              setPending(false);
            }
          }}
        >
          {items.map((item, index) => (
            <label key={item.id} className="block text-sm">
              {order.items[index]?.product.nameAr}
              <input
                aria-label={`كمية ${order.items[index]?.product.nameAr}`}
                type="number"
                min={0}
                max={99}
                required
                value={item.quantity}
                onChange={e =>
                  setItems(
                    items.map(x =>
                      x.id === item.id ? { ...x, quantity: Number(e.target.value) } : x
                    )
                  )
                }
                className="mx-2 min-h-11 w-20 rounded-lg border border-line bg-surface px-2"
              />
              <input
                aria-label={`ملاحظات ${order.items[index]?.product.nameAr}`}
                maxLength={500}
                value={item.note}
                onChange={e =>
                  setItems(items.map(x => (x.id === item.id ? { ...x, note: e.target.value } : x)))
                }
                className="mt-2 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
              />
            </label>
          ))}
          <p className="text-sm">
            قيمة المنتجات قبل الخصم:{' '}
            <b dir="ltr">
              {formatCurrency(
                items.reduce(
                  (sum, item, index) => sum + item.quantity * (order.items[index]?.unitPrice ?? 0),
                  0
                )
              )}
            </b>
          </p>
          <label className="block text-sm">
            ملاحظة الطلب
            <textarea
              maxLength={500}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-surface p-3"
            />
          </label>
          <button
            disabled={pending || !items.some(i => i.quantity > 0)}
            className="btn-primary min-h-11"
          >
            {pending ? 'جارٍ الحفظ…' : 'تأكيد التعديل'}
          </button>
          {error && (
            <p role="alert" className="text-sm text-danger-ink">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
