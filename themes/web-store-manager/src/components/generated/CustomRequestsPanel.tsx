import { useState } from 'react';
import {
  listStoreCustomRequests,
  offerPriceOnCustomRequest,
  useResource,
  useToast,
} from '@samou-go/api-client';
import { CustomRequestStatus } from '@samou-go/shared-types';
import { useLanguage } from '@samou-go/ui';
import { Loader2 } from 'lucide-react';

/**
 * Shows incoming custom requests (طلب مخصص) for a single store.
 * The store manager can offer a price on any PENDING request.
 */
export function CustomRequestsPanel({ storeId }: { storeId: string }) {
  const toast = useToast();
  const { t } = useLanguage();
  const requests = useResource(
    `store-custom:${storeId}`,
    (signal) => listStoreCustomRequests({ storeId }, signal),
    { pollMs: 15_000 },
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const offer = async (id: string) => {
    const offeredPrice = Number(values[id]);
    if (!Number.isFinite(offeredPrice) || offeredPrice <= 0) {
      return toast.error('أدخل سعراً صحيحاً', 'Enter a positive price');
    }
    setBusy(id);
    try {
      await offerPriceOnCustomRequest(id, { offeredPrice });
      requests.reload();
      toast.success('تم إرسال السعر', 'Offer sent');
    } catch (e) {
      toast.error(
        'تعذّر إرسال العرض',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mx-auto max-w-[720px] px-4 pb-24 pt-7">
      <h2 className="mb-5 text-lg font-extrabold">
        {t('الطلبات المخصصة', 'Custom Requests')}
      </h2>

      {requests.loading && !requests.data && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="animate-spin text-brand" />
        </div>
      )}

      {requests.error && (
        <div className="rounded-2xl border border-danger-tint bg-surface p-5 text-center shadow-card">
          <p className="text-sm text-danger-ink">
            {t('تعذّر تحميل الطلبات', 'Could not load requests')}
          </p>
          <button
            type="button"
            onClick={() => requests.reload()}
            className="mt-3 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white"
          >
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {requests.data?.items.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-line bg-surface p-4 shadow-card"
          >
            <div className="flex justify-between">
              <b>{item.customer.name}</b>
              <span className="text-xs text-ink-muted">{item.status}</span>
            </div>
            <p className="mt-2 text-sm">{item.description}</p>

            {item.status === CustomRequestStatus.PENDING && (
              <div className="mt-3 flex gap-2">
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={values[item.id] ?? ''}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [item.id]: e.target.value }))
                  }
                  className="input-field"
                  placeholder="₪ Price"
                />
                <button
                  disabled={busy === item.id}
                  onClick={() => void offer(item.id)}
                  className="rounded-xl bg-brand px-4 text-xs font-bold text-white"
                >
                  {t('إرسال عرض', 'Send Offer')}
                </button>
              </div>
            )}

            {item.offeredPrice !== null && (
              <p dir="ltr" className="mt-2 font-bold">
                ₪{item.offeredPrice.toFixed(2)}
              </p>
            )}
          </article>
        ))}

        {!requests.loading && !requests.error && !requests.data?.items.length && (
          <p className="py-8 text-center text-sm text-ink-muted">
            {t('لا توجد طلبات مخصصة', 'No custom requests yet')}
          </p>
        )}
      </div>
    </section>
  );
}
