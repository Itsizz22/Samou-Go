import { useEffect, useState } from 'react';
import {
  getPlatformSettings,
  updatePlatformSettings,
  uploadImage,
  getStores,
} from '@samou-go/api-client';
import { STORE_CATEGORIES } from '@samou-go/ui';
import { LayoutGrid } from 'lucide-react';
import type { HomeCategory, Store } from '@samou-go/shared-types';

export function CategoryImagesSettings() {
  const [items, setItems] = useState<HomeCategory[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    try {
      const settings = await getPlatformSettings();
      const all: Store[] = [];
      for (let page = 1; ; page++) {
        const result = await getStores({ page, pageSize: 100 });
        all.push(...result.items);
        if (page >= result.totalPages || !result.items.length) break;
      }
      setStores(all);
      setItems(
        settings.homeCategories ??
          STORE_CATEGORIES.map(category => ({ ...category, enabled: true }))
      );
      setReady(true);
    } catch {
      setMessage('تعذر التحميل. أعد المحاولة.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const update = (key: string, patch: Partial<HomeCategory>) =>
    setItems(current => current.map(item => (item.key === key ? { ...item, ...patch } : item)));
  async function attach(key: string, file: File) {
    if (busy) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    ) {
      setMessage('اختر JPG أو PNG أو WebP بحد أقصى 8 ميغابايت.');
      return;
    }
    setBusy(true);
    setMessage('جارٍ رفع الصورة…');
    try {
      const result = await uploadImage({ kind: 'banner' }, file);
      update(key, { imageUrl: result.url });
      setMessage('تم الرفع. اضغط حفظ الفئات لاعتماد التغيير.');
    } catch {
      setMessage('تعذر رفع الصورة؛ بقيت الصورة السابقة.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border border-line bg-surface p-4" dir="rtl" aria-busy={busy}>
      <h2 className="text-lg font-bold">فئات الصفحة الرئيسية</h2>
      <p className="mt-2 text-sm leading-7 text-ink-muted">
        أضف الفئات ورتّبها وعدّل أسماءها وصورها والمتاجر التابعة لها. الصور مستقلة عن شعارات
        المتاجر. المقاس المقترح 600 × 600 بكسل، مع هامش حول المحتوى. حذف الفئة لا يحذف متاجرها.
      </p>
      {!ready ? (
        <button onClick={() => void load()} className="min-h-11 text-brand">
          إعادة التحميل
        </button>
      ) : (
        <form
          onSubmit={async event => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setMessage('');
            try {
              await updatePlatformSettings({ homeCategories: items });
              setMessage('تم حفظ الفئات.');
            } catch {
              setMessage('تعذر الحفظ. راجع البيانات وأعد المحاولة.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="mt-4 space-y-4">
            {items.map((item, index) => (
              <div key={item.key} className="space-y-3 rounded-xl border border-line p-3">
                <div className="flex items-center gap-4">
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-tint text-brand">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.ar} className="size-full object-contain" />
                    ) : (
                      <LayoutGrid size={30} />
                    )}
                  </div>
                  <strong>{item.ar || 'فئة جديدة'}</strong>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    الاسم بالعربية
                    <input
                      required
                      maxLength={80}
                      value={item.ar}
                      onChange={e => update(item.key, { ar: e.target.value })}
                      className="input-field mt-1 w-full"
                    />
                  </label>
                  <label>
                    الاسم بالإنجليزية
                    <input
                      maxLength={80}
                      value={item.en}
                      onChange={e => update(item.key, { en: e.target.value })}
                      className="input-field mt-1 w-full"
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  صورة الفئة
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="mt-2 block w-full min-w-0"
                    onChange={e => {
                      const file = e.currentTarget.files?.[0];
                      e.currentTarget.value = '';
                      if (file) void attach(item.key, file);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => update(item.key, { imageUrl: undefined })}
                  className="min-h-11 text-brand"
                >
                  استعادة الأيقونة الافتراضية
                </button>
                {item.key !== 'all' && (
                  <details>
                    <summary className="cursor-pointer py-3 font-bold">
                      المتاجر التابعة للفئة
                    </summary>
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.storeIds !== undefined}
                        onChange={e =>
                          update(item.key, { storeIds: e.target.checked ? [] : undefined })
                        }
                      />
                      اختيار المتاجر يدويًا (بدل التصنيف حسب نوع المتجر)
                    </label>
                    {item.storeIds !== undefined && (
                      <div className="max-h-64 overflow-y-auto">
                        {stores.map(store => (
                          <label key={store.id} className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={item.storeIds?.includes(store.id) ?? false}
                              onChange={e =>
                                update(item.key, {
                                  storeIds: e.target.checked
                                    ? [...(item.storeIds ?? []), store.id]
                                    : item.storeIds?.filter(id => id !== store.id),
                                })
                              }
                            />
                            {store.nameAr}
                          </label>
                        ))}
                      </div>
                    )}
                  </details>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={e => update(item.key, { enabled: e.target.checked })}
                    />
                    إظهار
                  </label>
                  {[-1, 1].map(offset => (
                    <button
                      key={offset}
                      type="button"
                      disabled={index + offset < 0 || index + offset >= items.length}
                      className="min-h-11 text-brand disabled:opacity-30"
                      onClick={() =>
                        setItems(current => {
                          const next = [...current];
                          next.splice(index, 1);
                          next.splice(index + offset, 0, item);
                          return next;
                        })
                      }
                    >
                      {offset === -1 ? 'تقديم' : 'تأخير'}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="min-h-11 text-danger-ink"
                    onClick={() => {
                      if (window.confirm('حذف الفئة من الواجهة؟ لن تُحذف المتاجر.'))
                        setItems(current => current.filter(category => category.key !== item.key));
                    }}
                  >
                    حذف الفئة
                  </button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="min-h-11 rounded-xl border border-brand px-4 text-brand"
                onClick={() =>
                  setItems(current => [
                    ...current,
                    { key: crypto.randomUUID(), ar: '', en: '', enabled: true, storeIds: [] },
                  ])
                }
              >
                إضافة فئة
              </button>
              <button
                type="submit"
                className="min-h-11 rounded-xl bg-brand px-4 font-bold text-white"
              >
                حفظ الفئات
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <p role="status" className="mt-3 text-sm">
        {message}
      </p>
    </section>
  );
}
