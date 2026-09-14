import { CalendarClock } from 'lucide-react';
import { useStore } from '@/hooks/useApi';
import { storeLocalDateTime } from '@/lib/store-time';
import type { Store } from '@samou-go/shared-types';

export function OrderSchedulePicker({ storeId, value, onChange }: { storeId: string | null; value: string; onChange: (value: string) => void }) {
  const { data } = useStore(storeId, { pollMs: 30_000 });
  return <OrderScheduleOptions store={data} value={value} onChange={onChange} />;
}

export function OrderScheduleOptions({ store: data, value, onChange }: { store?: Store | null; value: string; onChange: (value: string) => void }) {
  if (!data?.acceptsScheduledOrders) return value ? <div role="alert" className="mb-4 text-sm text-danger">الجدولة غير متاحة لهذا المتجر الآن. <button type="button" className="underline" onClick={() => onChange('')}>الطلب الآن</button></div> : null;
  return <fieldset className="mb-4 rounded-2xl border border-line bg-surface p-4">
    <legend className="px-1 text-sm font-bold"><CalendarClock size={16} className="me-2 inline text-brand" /> متى نبدأ تحضير طلبك؟</legend>
    <div className="flex gap-2">
      <button type="button" aria-pressed={!value} onClick={() => onChange('')} className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-bold ${!value ? 'bg-brand text-white' : 'bg-canvas text-ink'}`}>الآن</button>
      <button type="button" aria-pressed={!!value} onClick={() => onChange(value || storeLocalDateTime(new Date(Date.now() + 2 * 60 * 60_000)))} className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-bold ${value ? 'bg-brand text-white' : 'bg-canvas text-ink'}`}>لوقت لاحق</button>
    </div>
    {!!value && <label className="mt-3 block text-xs font-bold">وقت بدء التحضير بتوقيت السموع
      <input type="datetime-local" dir="ltr" value={value} min={storeLocalDateTime(new Date(Date.now() + 60 * 60_000))} max={storeLocalDateTime(new Date(Date.now() + 7 * 24 * 60 * 60_000))} onChange={event => onChange(event.target.value)} className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-line bg-canvas px-3 text-sm" />
      <span className="mt-2 block font-normal leading-5 text-ink-muted">ساعات العمل: <bdi>{data.openingTime} – {data.closingTime}</bdi>. هذا موعد بدء التحضير؛ يؤكد المتجر الجاهزية لاحقاً.</span>
    </label>}
  </fieldset>;
}
