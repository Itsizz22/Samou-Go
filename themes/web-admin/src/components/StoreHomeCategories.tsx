import { useEffect, useState } from 'react';
import { getPlatformSettings, updatePlatformSettings } from '@samou-go/api-client';
import { STORE_CATEGORIES } from '@samou-go/ui';
import type { HomeCategory } from '@samou-go/shared-types';

const automaticKeys = new Set<string>(STORE_CATEGORIES.map(category => category.key));
export const selectableHomeCategories = (items: HomeCategory[]) =>
  items.filter(
    category =>
      category.key !== 'all' &&
      (category.storeIds !== undefined || !automaticKeys.has(category.key))
  );

/** Preserve unrelated stores, categories and automatic store-type grouping. */
export function applyStoreCategoryChanges(
  items: HomeCategory[],
  storeId: string,
  added: string[],
  removed: string[]
): HomeCategory[] {
  const selectable = new Set(selectableHomeCategories(items).map(category => category.key));
  if (added.some(key => !selectable.has(key)))
    throw new Error('تغيّرت الفئات. أعد تحميلها ثم حاول مجددًا.');
  return items.map(category => {
    if (added.includes(category.key))
      return { ...category, storeIds: [...new Set([...(category.storeIds ?? []), storeId])] };
    if (removed.includes(category.key) && category.storeIds !== undefined)
      return { ...category, storeIds: category.storeIds.filter(id => id !== storeId) };
    return category;
  });
}

export async function saveStoreHomeCategories(
  storeId: string,
  added: string[],
  removed: string[] = []
) {
  if (!added.length && !removed.length) return;
  const current = await getPlatformSettings();
  const homeCategories = applyStoreCategoryChanges(
    current.homeCategories ?? [],
    storeId,
    added,
    removed
  );
  await updatePlatformSettings({ homeCategories });
}

export function StoreHomeCategoryPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<HomeCategory[]>([]);
  const [message, setMessage] = useState('جارٍ تحميل الفئات…');
  async function load() {
    try {
      const settings = await getPlatformSettings();
      setItems(selectableHomeCategories(settings.homeCategories ?? []));
      setMessage('');
    } catch {
      setMessage('تعذر تحميل الفئات. أعد المحاولة.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <fieldset disabled={disabled} className="space-y-2 rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-bold">فئات المتجر المخصصة</legend>
      <p className="text-xs leading-6 text-ink-muted">
        تظهر الفئات التي تضيفها من إعدادات الأقسام هنا. نوع المتجر يحدد طريقة عمله، والفئات تحدد
        مكان ظهوره للزبون.
      </p>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {!message && !items.length && (
        <p className="text-sm text-ink-muted">لا توجد فئات مخصصة محفوظة بعد.</p>
      )}
      <div className="max-h-48 overflow-y-auto">
        {items.map(category => (
          <label key={category.key} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.includes(category.key)}
              onChange={event =>
                onChange(
                  event.target.checked
                    ? [...new Set([...value, category.key])]
                    : value.filter(key => key !== category.key)
                )
              }
            />
            {category.ar}
            {!category.enabled ? ' (مخفية عن الزبون)' : ''}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void load()}
        className="min-h-11 text-sm font-bold text-brand"
      >
        تحديث قائمة الفئات
      </button>
    </fieldset>
  );
}

export function StoreHomeCategoryEditor({ storeId }: { storeId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [initial, setInitial] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    setReady(false);
    setMessage('جارٍ تحميل تصنيف المتجر…');
    try {
      const settings = await getPlatformSettings();
      const keys = selectableHomeCategories(settings.homeCategories ?? [])
        .filter(category => category.storeIds?.includes(storeId))
        .map(category => category.key);
      setSelected(keys);
      setInitial(keys);
      setReady(true);
      setMessage('');
    } catch {
      setMessage('تعذر تحميل تصنيف المتجر. أعد المحاولة.');
    }
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await saveStoreHomeCategories(
        storeId,
        selected.filter(key => !initial.includes(key)),
        initial.filter(key => !selected.includes(key))
      );
      setInitial(selected);
      setMessage('تم حفظ فئات المتجر.');
    } catch {
      setMessage('تعذر حفظ الفئات. أعد تحميلها وحاول مجددًا.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 min-w-0">
      <button
        type="button"
        className="min-h-11 text-sm font-bold text-brand"
        onClick={() => {
          setOpen(!open);
          if (!open) void load();
        }}
      >
        تصنيف المتجر ضمن الفئات
      </button>
      {open && (
        <div className="space-y-2">
          {ready && (
            <>
              <StoreHomeCategoryPicker value={selected} onChange={setSelected} disabled={busy} />
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="min-h-11 rounded-lg bg-brand px-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? 'جارٍ الحفظ…' : 'حفظ تصنيف المتجر'}
              </button>
            </>
          )}
          {!ready && (
            <button type="button" className="min-h-11 text-brand" onClick={() => void load()}>
              إعادة التحميل
            </button>
          )}
          <p role="status" className="text-sm">
            {message}
          </p>
        </div>
      )}
    </div>
  );
}
