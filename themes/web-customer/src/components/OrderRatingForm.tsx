import { useState } from 'react';
import { rateDeliveredOrder } from '@samou-go/api-client';
export function OrderRatingForm({ orderId, hasCaptain }: { orderId: string; hasCaptain: boolean }) {
  const [storeRating, setStoreRating] = useState(0);
  const [captainRating, setCaptainRating] = useState(0);
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <form
      className="space-y-3 rounded-2xl bg-surface p-4 shadow-card"
      onSubmit={async e => {
        e.preventDefault();
        if (pending) return;
        setPending(true);
        setMessage('');
        try {
          await rateDeliveredOrder(orderId, {
            storeRating,
            ...(hasCaptain && captainRating ? { captainRating } : {}),
            comment,
          });
          setMessage('شكراً، تم حفظ تقييمك');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'تعذر حفظ التقييم');
        } finally {
          setPending(false);
        }
      }}
    >
      <h2 className="font-bold">كيف كانت تجربتك؟</h2>
      {[
        { label: 'تقييم المتجر', value: storeRating, change: setStoreRating },
        ...(hasCaptain
          ? [{ label: 'تقييم التوصيل', value: captainRating, change: setCaptainRating }]
          : []),
      ].map(field => (
        <fieldset key={field.label} disabled={pending}>
          <legend className="text-sm">{field.label}</legend>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                aria-label={`${field.label}: ${n} من 5`}
                aria-pressed={field.value === n}
                onClick={() => field.change(n)}
                className={`min-h-11 min-w-11 rounded-lg border ${n <= field.value ? 'bg-brand text-white border-brand' : 'border-line text-ink-muted'}`}
              >
                {n} ★
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <label className="block text-sm">
        ملاحظتك (اختياري)
        <textarea
          maxLength={1000}
          value={comment}
          onChange={e => setComment(e.target.value)}
          className="mt-2 w-full rounded-xl border border-line bg-surface p-3"
        />
      </label>
      <button disabled={pending || !storeRating} className="btn-primary min-h-11">
        {pending ? 'جارٍ الحفظ…' : 'حفظ التقييم'}
      </button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
