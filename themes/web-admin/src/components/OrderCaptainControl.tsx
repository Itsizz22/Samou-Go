import { useState } from 'react';
import { assignOrderCaptain, listUsers, useResource } from '@/hooks/useApi';
import { OrderStatus, UserRole, type OrderDetail, type PublicUser } from '@samou-go/shared-types';
import { Truck, RefreshCw } from 'lucide-react';

export function OrderCaptainControl({ order, onAssigned }: { order: OrderDetail; onAssigned: () => void }) {
  const [selection, setSelection] = useState<{ id: string; previous: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const assignable = order.fulfillmentType === 'DELIVERY' &&
    [OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP].some(status => status === order.status) && !order.changeProposal;
  const captains = useResource<PublicUser[]>('admin-assignable-captains', async signal => {
    const items: PublicUser[] = [];
    let page = 1;
    for (;;) {
      const result = await listUsers({ role: UserRole.CAPTAIN, page, pageSize: 100 }, signal);
      items.push(...result.items);
      if (page >= result.totalPages) return items;
      page += 1;
    }
  }, { enabled: assignable, pollMs: 15000 });
  const stale = selection !== null && selection.previous !== order.captainId;
  const save = async () => {
    if (!selection || saving || stale) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await assignOrderCaptain(order.id, { captainId: selection.id, expectedCaptainId: selection.previous });
      setSelection(null); setMessage('تم حفظ تعيين الشوفير بنجاح.'); onAssigned();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تعيين الشوفير. حاول مجددًا.');
      onAssigned();
    } finally { setSaving(false); }
  };
  return <section className="admin-captain-control m-5 rounded-xl border border-line bg-canvas p-4" aria-labelledby="captain-control-title">
    <div className="flex items-center gap-2"><Truck size={19} className="text-brand" /><h3 id="captain-control-title" className="font-extrabold">إدارة شوفير الطلب</h3></div>
    <p className="mt-2 text-sm">الشوفير الحالي: <strong>{order.captain?.name ?? 'لم يتم التعيين'}</strong></p>
    {!assignable ? <p className="mt-2 text-sm text-ink-muted">{order.fulfillmentType === 'PICKUP' ? 'هذا الطلب استلام من المحل ولا يحتاج شوفيرًا.' : order.status === OrderStatus.ON_THE_WAY ? 'تم استلام الطلب من المحل؛ لا يمكن نقل حجزه بعد بدء التوصيل.' : 'يتاح التعيين بعد قبول الطلب واعتماد الفاتورة وقبل استلامه من المحل.'}</p> : <>
      <p className="mt-2 text-sm text-ink-muted">يمكنك نقل الطلب المحجوز لشوفير آخر قبل استلامه من المحل. تبقى حالة الطلب ومبالغه كما هي.</p>
      <label htmlFor="order-captain" className="mb-2 mt-4 block text-sm font-semibold">اختر الشوفير</label>
      <select id="order-captain" className="w-full rounded-lg border border-line bg-surface p-3 text-sm" value={selection?.id ?? ''} disabled={saving || captains.loading} onChange={e => { setSelection(e.target.value ? { id: e.target.value, previous: order.captainId } : null); setError(''); setMessage(''); }}>
        <option value="">اختر من الشوفيرين المتاحين</option>
        {(captains.data ?? []).filter(c => c.isActive && c.isVerified && c.isAvailable && c.id !== order.captainId).map(c => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
      </select>
      {captains.error && <p role="alert" className="mt-2 text-sm text-danger-ink">تعذر تحميل الشوفيرين. <button type="button" className="underline" onClick={() => void captains.reload()}>إعادة المحاولة</button></p>}
      {!captains.loading && !captains.error && !(captains.data ?? []).some(c => c.isActive && c.isVerified && c.isAvailable && c.id !== order.captainId) && <p className="mt-2 text-sm text-ink-muted">لا يوجد شوفير آخر متاح حاليًا.</p>}
      {selection && <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
        {stale ? <p role="alert">تغير الشوفير أثناء مراجعتك؛ اختر الشوفير مجددًا قبل التأكيد.</p> : <p>سيتم {order.captain ? 'نقل الطلب من ' + order.captain.name + ' إلى' : 'تعيين الطلب إلى'} <strong>{captains.data?.find(c => c.id === selection.id)?.name}</strong>.</p>}
        <button type="button" disabled={saving || stale} onClick={() => void save()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-50">{saving && <RefreshCw size={15} className="animate-spin" />}{saving ? 'جارٍ الحفظ…' : order.captain ? 'تأكيد نقل الطلب' : 'تأكيد تعيين الشوفير'}</button>
      </div>}
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-danger-ink">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm font-semibold text-brand">{message}</p>}
  </section>;
}
