import { useEffect, useState } from 'react';
import type { PublicUser } from '@samou-go/shared-types';
type StoreChoice = { id: string; nameAr: string };
export const assignedIds = (user: Pick<PublicUser, 'assignedStoreId' | 'assignedStoreIds'>): string[] => user.assignedStoreIds ?? (user.assignedStoreId ? [user.assignedStoreId] : []);
export function StoreChoices({ stores, value, onChange, disabled = false, blocked = false }: { blocked?: boolean; stores: StoreChoice[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="min-w-44 space-y-2" dir="rtl">
    <legend className="mb-2 text-sm font-bold">{blocked ? "المتاجر المحجوبة" : "نوع السائق والمتاجر المخصصة"}</legend>
    {!blocked && <button type="button" aria-pressed={!value.length} onClick={() => onChange([])} className="min-h-11 rounded-xl border border-brand px-3 text-sm font-bold text-brand">{!value.length ? "✓ سائق عام" : "تحويل إلى سائق عام"}</button>}
    <details className="rounded-xl border border-line bg-surface p-3">
      <summary className="min-h-8 cursor-pointer text-sm font-semibold">{value.length ? `${value.length} متاجر محددة` : blocked ? 'لا توجد متاجر محجوبة' : 'سائق عام — اختر متاجر للتخصيص'}</summary>
      <div className="mt-2 max-h-52 overflow-y-auto">
        {stores.map(store => <label key={store.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-brand/10">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={value.includes(store.id)} onChange={event => onChange(event.target.checked ? [...value, store.id] : value.filter(id => id !== store.id))} />
          <span>{store.nameAr}</span>
        </label>)}
        {!stores.length && <p className="text-sm text-ink-muted">لا توجد متاجر متاحة في القائمة.</p>}
      </div>
    </details>
    {value.length > 0 && <p className="max-w-64 whitespace-normal text-xs text-ink-muted">{value.map(id => stores.find(store => store.id === id)?.nameAr ?? 'متجر مخصص خارج القائمة').join('، ')}</p>}
    <p className="max-w-64 whitespace-normal text-xs text-ink-muted">{blocked ? "لن يرى طلبات هذه المتاجر أو يتلقى تنبيهاتها. الحجب يتقدم على التخصيص." : "السائق العام يستقبل طلبات المتاجر التي ليس لها سائقون مخصصون. يمكن تخصيص عدة سائقين لنفس المتجر."}</p>
  </fieldset>;
}
export function CaptainStoreAssignment({ user, stores, disabled, onSave }: { user: PublicUser; stores: StoreChoice[]; disabled?: boolean; onSave: (ids: string[], blockedIds: string[]) => Promise<unknown> }) {
  const key = assignedIds(user).join('|');
  const [value, setValue] = useState(() => assignedIds(user));
  const blockedKey = (user.blockedStoreIds ?? []).join('|');
  const [blockedValue, setBlockedValue] = useState<string[]>(user.blockedStoreIds ?? []);
  useEffect(() => setBlockedValue(blockedKey ? blockedKey.split('|') : []), [blockedKey]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setValue(key ? key.split('|') : []); setError(''); }, [key]);
  const changed = [...blockedValue].sort().join('|') !== [...(user.blockedStoreIds ?? [])].sort().join('|') || [...value].sort().join('|') !== [...assignedIds(user)].sort().join('|');
  return <div className="space-y-2"><StoreChoices stores={stores} value={value} onChange={setValue} disabled={disabled || pending} />
    <StoreChoices blocked stores={stores} value={blockedValue} onChange={setBlockedValue} disabled={disabled || pending} />
    <button type="button" disabled={disabled || pending || !changed} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50" onClick={async () => {
      setPending(true); setError('');
      try { await onSave(value, blockedValue); } catch { setError('تعذر حفظ المتاجر، أعد المحاولة.'); }
      finally { setPending(false); }
    }}>{pending ? 'جارٍ الحفظ…' : 'حفظ المتاجر'}</button>
    {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
  </div>;
}
