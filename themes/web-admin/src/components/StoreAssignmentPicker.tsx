import { useEffect, useState } from 'react';
import type { PublicUser } from '@samou-go/shared-types';
type StoreChoice = { id: string; nameAr: string };
export const assignedIds = (user: Pick<PublicUser, 'assignedStoreId' | 'assignedStoreIds'>): string[] => user.assignedStoreIds ?? (user.assignedStoreId ? [user.assignedStoreId] : []);
export function StoreChoices({ stores, value, onChange, disabled = false }: { stores: StoreChoice[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="min-w-44 space-y-2" dir="rtl">
    <legend className="mb-2 text-sm font-bold">المتاجر المخصصة</legend>
    <details className="rounded-xl border border-line bg-surface p-3">
      <summary className="min-h-8 cursor-pointer text-sm font-semibold">{value.length ? `${value.length} متاجر محددة` : 'كابتن عام — اختر متاجر للتخصيص'}</summary>
      <div className="mt-2 max-h-52 overflow-y-auto">
        {stores.map(store => <label key={store.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-brand/10">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={value.includes(store.id)} onChange={event => onChange(event.target.checked ? [...value, store.id] : value.filter(id => id !== store.id))} />
          <span>{store.nameAr}</span>
        </label>)}
        {!stores.length && <p className="text-sm text-ink-muted">لا توجد متاجر متاحة في القائمة.</p>}
      </div>
    </details>
    {value.length > 0 && <p className="max-w-64 whitespace-normal text-xs text-ink-muted">{value.map(id => stores.find(store => store.id === id)?.nameAr ?? 'متجر مخصص خارج القائمة').join('، ')}</p>}
    <p className="max-w-64 whitespace-normal text-xs text-ink-muted">دون تحديد متاجر: كابتن عام. عند التخصيص: يستقبل الطلبات المتاحة من متاجره فقط.</p>
  </fieldset>;
}
export function CaptainStoreAssignment({ user, stores, disabled, onSave }: { user: PublicUser; stores: StoreChoice[]; disabled?: boolean; onSave: (ids: string[]) => Promise<unknown> }) {
  const key = assignedIds(user).join('|');
  const [value, setValue] = useState(() => assignedIds(user));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setValue(key ? key.split('|') : []); setError(''); }, [key]);
  const changed = [...value].sort().join('|') !== [...assignedIds(user)].sort().join('|');
  return <div className="space-y-2"><StoreChoices stores={stores} value={value} onChange={setValue} disabled={disabled || pending} />
    <button type="button" disabled={disabled || pending || !changed} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50" onClick={async () => {
      setPending(true); setError('');
      try { await onSave(value); } catch { setError('تعذر حفظ المتاجر، أعد المحاولة.'); }
      finally { setPending(false); }
    }}>{pending ? 'جارٍ الحفظ…' : 'حفظ المتاجر'}</button>
    {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
  </div>;
}
