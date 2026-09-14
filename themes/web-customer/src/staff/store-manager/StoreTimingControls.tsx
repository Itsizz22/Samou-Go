import { useState } from 'react';
import { Clock3, CalendarClock } from 'lucide-react';
import { updateStore, useToast } from '@samou-go/api-client';
import type { Store } from '@samou-go/shared-types';
import { StoreStatus } from '@samou-go/shared-types';

export function StoreTimingControls({ store, onSaved }: { store: Store; onSaved: () => void }) {
  const [extra, setExtra] = useState(15);
  const [duration, setDuration] = useState(60);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const save = async (input: Parameters<typeof updateStore>[1]) => {
    setPending(true);
    try { await updateStore(store.id, input); onSaved(); toast.success('تم حفظ إعدادات الوقت', 'Timing settings saved'); }
    catch (error) { toast.error('تعذر الحفظ', error instanceof Error ? error.message : 'حاول مجدداً'); }
    finally { setPending(false); }
  };
  return <details className="mt-3 border-t border-line pt-3 text-ink">
    <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold"><Clock3 size={17} /> الازدحام والطلبات المجدولة</summary>
    <div className="space-y-4 py-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-bold">وقت إضافي للتحضير
          <select className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3" value={extra} onChange={event => setExtra(Number(event.target.value))}>
            {[10, 15, 20, 30, 45, 60].map(value => <option key={value} value={value}>{value} دقيقة</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">مدة الازدحام
          <select className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3" value={duration} onChange={event => setDuration(Number(event.target.value))}>
            {[30, 60, 120, 180].map(value => <option key={value} value={value}>{value} دقيقة</option>)}
          </select>
        </label>
      </div>
      <button type="button" disabled={pending} onClick={() => void save({ storeStatus: StoreStatus.BUSY, busyExtraMinutes: extra, busyUntil: new Date(Date.now() + duration * 60_000).toISOString() })} className="min-h-11 w-full rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50">تفعيل الازدحام المؤقت</button>
      {!!store.busyExtraMinutes && <p className="text-xs text-ink-muted">الزيادة الحالية: {store.busyExtraMinutes} دقيقة. اختر «مفتوح» لإنهائها الآن.</p>}
      <label className="flex min-h-11 items-center gap-3 border-t border-line pt-3 text-sm font-bold">
        <CalendarClock size={18} className="text-brand" />
        <span className="flex-1">استقبال طلبات لوقت لاحق</span>
        <input type="checkbox" className="size-5 accent-brand" checked={store.acceptsScheduledOrders ?? false} disabled={pending || !store.openingTime || !store.closingTime} onChange={event => void save({ acceptsScheduledOrders: event.target.checked })} />
      </label>
      <p className="text-xs leading-5 text-ink-muted">{store.openingTime && store.closingTime ? 'يختار الزبون وقت بدء التحضير ضمن ساعات العمل، بعد ساعة وحتى أسبوع. سيصلك تذكير عند حلول الموعد.' : 'حدد ساعات العمل من إعدادات المتجر أولاً لتفعيل الجدولة.'}</p>
    </div>
  </details>;
}
