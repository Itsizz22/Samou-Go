import { useEffect, useId, useRef, useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.current?.close();
      document.body.style.overflow = previousOverflow;
      if (active instanceof HTMLElement) active.focus();
    };
  }, [open]);
  const close = () => { if (!pending) setOpen(false); };
  return <div className="min-w-32">
    <p className="text-xs font-semibold">{assignedIds(user).length ? `مخصص لـ ${assignedIds(user).length} متجر` : 'سائق عام'}{(user.blockedStoreIds?.length ?? 0) > 0 && <span className="ms-2 text-ink-muted">حجب {user.blockedStoreIds?.length}</span>}</p>
    <button type="button" disabled={disabled} className="mt-1 rounded-lg border border-line px-3 py-2 text-xs font-bold text-brand disabled:opacity-50" aria-label={`إعدادات متاجر ${user.name}`} onClick={() => {
      setValue(assignedIds(user)); setBlockedValue(user.blockedStoreIds ?? []); setError(''); setOpen(true);
    }}>إعدادات المتاجر</button>
    {open && <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }} dir="rtl" className="admin-assignment-dialog m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-black/50">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface p-4">
        <h3 id={titleId} className="text-base font-bold">متاجر السائق — {user.name}</h3>
        <button type="button" disabled={pending} onClick={close} className="rounded-lg border border-line px-3 py-2 text-sm">إغلاق</button>
      </header>
      <div className="space-y-5 p-4">
        <StoreChoices stores={stores} value={value} onChange={setValue} disabled={disabled || pending} />
        <StoreChoices blocked stores={stores} value={blockedValue} onChange={setBlockedValue} disabled={disabled || pending} />
        {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      </div>
      <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface p-4">
        <button type="button" disabled={pending} onClick={close} className="rounded-lg border border-line px-4 py-2 text-sm">إلغاء</button>
        <button type="button" disabled={disabled || pending || !changed} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50" onClick={async () => {
          setPending(true); setError('');
          try { await onSave(value, blockedValue); } catch { setError('تعذر حفظ المتاجر، أعد المحاولة.'); }
          finally { setPending(false); }
        }}>{pending ? 'جارٍ الحفظ…' : 'حفظ المتاجر'}</button>
      </footer>
    </dialog>}
  </div>;
}
