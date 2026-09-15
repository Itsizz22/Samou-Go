import { useEffect, useState } from 'react';
import { getPlatformSettings, updatePlatformSettings, updateStore } from '@samou-go/api-client';
import { AppSelect } from '@samou-go/ui';
import { STORE_TYPE_LABELS, type StoreType, type HomeCategory } from '@samou-go/shared-types';
import { applyStoreCategoryChanges, selectableHomeCategories } from './StoreHomeCategories';

export function StoreTypeEditor({ storeId, storeType, onSaved }: {
  storeId: string; storeType: StoreType | null; onSaved: () => void | Promise<unknown>;
}) {
  const [items, setItems] = useState<HomeCategory[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  async function load() {
    try { setItems((await getPlatformSettings()).homeCategories ?? []); setReady(true); }
    catch { setMessage('تعذر تحميل الأنواع. حاول مجددًا.'); }
  }
  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('samou:store-types-updated', refresh);
    return () => window.removeEventListener('samou:store-types-updated', refresh);
  }, [storeId]);
  const custom = selectableHomeCategories(items);
  const assigned = custom.find(item => item.storeIds?.includes(storeId));
  const value = assigned ? `category:${assigned.key}` : storeType ?? '';
  async function choose(value: string) {
    setBusy(true); setMessage('');
    try {
      const current = (await getPlatformSettings()).homeCategories ?? [];
      const removed = selectableHomeCategories(current).filter(c => c.storeIds?.includes(storeId)).map(c => c.key);
      const key = value.startsWith('category:') ? value.slice(9) : null;
      if (!key) await updateStore(storeId, { storeType: value ? value as StoreType : null });
      if (key || removed.length) await updatePlatformSettings({ homeCategories: applyStoreCategoryChanges(current, storeId, key ? [key] : [], removed.filter(k => k !== key)) });
      await load(); await onSaved(); setMessage('تم حفظ نوع المتجر.');
    } catch { setMessage('تعذر حفظ النوع. أعد المحاولة.'); }
    finally { setBusy(false); }
  }
  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true); setMessage('');
    try {
      const current = (await getPlatformSettings()).homeCategories ?? [];
      if (current.some(c => c.ar.trim() === name.trim()) || Object.values(STORE_TYPE_LABELS).some(c => c.ar === name.trim())) throw new Error('هذا النوع موجود بالفعل. اختره من القائمة.');
      await updatePlatformSettings({ homeCategories: [...current, { key: `type-${crypto.randomUUID()}`, ar: name.trim(), en: '', enabled: true, storeIds: [] }] });
      window.dispatchEvent(new Event('samou:store-types-updated'));
      await load(); setName(''); setCreating(false); setMessage('تم إنشاء النوع؛ يمكنك اختياره من القائمة.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر إنشاء النوع.'); }
    finally { setBusy(false); }
  }
  return <div className="mt-2 space-y-2">
    <label className="block text-xs text-ink-muted">نوع المتجر
      <AppSelect aria-label="نوع المتجر" value={value} disabled={!ready || busy} onChange={event => void choose(event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-surface p-3 text-ink">
        <option value="">غير محدد</option>
        {Object.entries(STORE_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label.ar}</option>)}
        {custom.map(c => <option key={c.key} value={`category:${c.key}`}>{c.ar}{c.enabled ? '' : ' (مخفي)'}</option>)}
      </AppSelect>
    </label>
    {!ready && <button type="button" onClick={() => void load()} className="min-h-11 text-brand">إعادة تحميل الأنواع</button>}
    <button type="button" disabled={busy} onClick={() => setCreating(!creating)} className="min-h-11 text-sm font-bold text-brand">{creating ? 'إلغاء' : 'إنشاء نوع جديد'}</button>
    {creating && <div className="flex flex-wrap gap-2"><input aria-label="اسم النوع الجديد" value={name} maxLength={80} onChange={e => setName(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3" placeholder="مثل: عطور" /><button type="button" disabled={busy || !name.trim()} onClick={() => void create()} className="min-h-11 rounded-xl bg-brand px-3 text-white disabled:opacity-50">إنشاء النوع</button></div>}
    {message && <p role="status" className="text-xs text-ink-muted">{message}</p>}
  </div>;
}
