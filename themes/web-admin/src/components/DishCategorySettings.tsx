import { useEffect, useState } from 'react';
import { getDishCategoryOptions, getPlatformSettings, updatePlatformSettings } from '@samou-go/api-client';
type Option = Awaited<ReturnType<typeof getDishCategoryOptions>>[number];
type Selection = { discoveryCategoryIds: string[] | null; featuredCategoryIds: string[] | null };
const sections = [ ['discoveryCategoryIds', 'اكتشف طبقك اليوم'], ['featuredCategoryIds', 'أطباق مميزة اخترناها لك'] ] as const;
export function DishCategorySettings({ onSaved }: { onSaved: () => void }) {
  const [options, setOptions] = useState<Option[]>([]);
  const [selection, setSelection] = useState<Selection>({ discoveryCategoryIds: null, featuredCategoryIds: null });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const load = () => {
    setMessage('');
    Promise.all([getDishCategoryOptions(), getPlatformSettings()]).then(([rows, settings]) => {
      setOptions(rows); setSelection({ discoveryCategoryIds: settings.discoveryCategoryIds ?? null, featuredCategoryIds: settings.featuredCategoryIds ?? null }); setReady(true);
    }).catch(() => setMessage('تعذر تحميل الأقسام. أعد المحاولة.'));
  };
  useEffect(load, []);
  const save = async () => {
    setBusy(true); setMessage('');
    try { await updatePlatformSettings(selection); setMessage('تم حفظ أقسام العرض للقسمين.'); onSaved(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر الحفظ'); }
    finally { setBusy(false); }
  };
  const stores = [...new Map(options.map(option => [option.store.id, option.store])).values()];
  return <section className="space-y-4 rounded-2xl border border-line bg-surface p-5" aria-label="أقسام أطباق الرئيسية">
    <h3 className="text-lg font-bold">أقسام أطباق الرئيسية</h3>
    <p className="text-sm leading-6 text-ink-muted">اختر أقسام الطعام من كل مطعم لكل مساحة عرض بشكل مستقل. تظهر المنتجات المتاحة ذات الصور فقط، وتبقى المشروبات في قائمة المتجر.</p>
    {!ready && <button type="button" onClick={load} className="min-h-11 text-brand">{message ? 'إعادة المحاولة' : 'جارٍ تحميل الأقسام…'}</button>}
    <fieldset disabled={!ready || busy} className="min-w-0 space-y-5">
      <label className="block text-sm">ابحث عن مطعم أو قسم<input value={query} onChange={e => setQuery(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3 focus-visible:ring-2 focus-visible:ring-brand" /></label>
      {sections.map(([key, label]) => <fieldset key={key} className="min-w-0 space-y-3 rounded-xl border border-line p-3">
        <legend className="px-2 font-bold">{label}</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={selection[key] === null} onChange={e => setSelection(s => ({ ...s, [key]: e.target.checked ? null : [] }))} className="size-5 accent-brand" />اختيار تلقائي من أقسام الطعام</label>
        {selection[key] !== null && <>
          <p className="text-xs text-ink-muted">حدد الأقسام أدناه. عدم تحديد أي قسم يخفي هذه المساحة عن العميل.</p>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {stores.map(store => {
              const rows = options.filter(option => option.store.id === store.id && `${store.nameAr} ${option.nameAr}`.includes(query.trim()));
              if (!rows.length) return null;
              return <div key={store.id} className="space-y-1"><h4 className="text-sm font-bold text-brand">{store.nameAr}</h4>{rows.map(option => <label key={option.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-canvas"><input type="checkbox" checked={selection[key]?.includes(option.id) ?? false} onChange={e => setSelection(s => ({ ...s, [key]: e.target.checked ? [...(s[key] ?? []), option.id] : (s[key] ?? []).filter(id => id !== option.id) }))} className="size-5 accent-brand" />{option.nameAr}</label>)}</div>;
            })}
          </div>
          {!options.length && <p className="text-sm text-ink-muted">لا توجد أقسام متاحة.</p>}
        </>}
      </fieldset>)}
      <button type="button" onClick={save} className="min-h-11 rounded-xl bg-brand px-4 font-bold text-white disabled:opacity-50">{busy ? 'جارٍ الحفظ…' : 'حفظ أقسام العرض'}</button>
    </fieldset>
    <p role="status" className="text-sm">{message}</p>
  </section>;
}
