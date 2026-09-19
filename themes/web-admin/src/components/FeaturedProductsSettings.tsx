import { DishCategorySettings } from './DishCategorySettings';
import { useEffect, useState } from 'react';
import {
  getFeaturedSelection,
  saveFeaturedSelection,
  searchProducts,
  getStores,
  type FeaturedSelectionProduct,
} from '@samou-go/api-client';
import { isDishStore, type Store } from '@samou-go/shared-types';
import type { PopularProduct } from '@samou-go/shared-types';
export function FeaturedProductsSettings() {
  const [categoryRevision, setCategoryRevision] = useState(0);
  const [selected, setSelected] = useState<FeaturedSelectionProduct[]>([]);
  const [query, setQuery] = useState('');
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const rows: Store[] = [];
      let current = 1;
      while (!controller.signal.aborted) {
        const data = await getStores({ page: current, pageSize: 100, activeOnly: false }, controller.signal, true);
        rows.push(...data.items);
        if (current * data.pageSize >= data.total) break;
        current += 1;
      }
      if (!controller.signal.aborted) setStores(rows.filter(isDishStore));
    })().catch(() => { if (!controller.signal.aborted) setMessage('تعذر تحميل المتاجر؛ أعد فتح الإعدادات.'); });
    return () => controller.abort();
  }, []);
  const [results, setResults] = useState<PopularProduct[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    getFeaturedSelection()
      .then(rows => {
        if (active) {
          setSelected(rows);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setMessage('تعذر تحميل المنتجات المختارة؛ أعد فتح الإعدادات.');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchProducts(query, page, controller.signal, true, 'featured', { storeId: storeId || undefined })
        .then(data => {
          if (!controller.signal.aborted) { setResults(data.items); setTotal(data.total); }
        })
        .catch(() => {
          if (!controller.signal.aborted) { setResults([]); setMessage('تعذر البحث؛ حاول مجددًا.'); }
        }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, categoryRevision, page, storeId]);
  const move = (index: number, delta: number) => {
    const rows = [...selected];
    const other = rows[index + delta];
    const item = rows[index];
    if (!item || !other) return;
    rows[index] = other;
    rows[index + delta] = item;
    setSelected(rows);
  };
  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setMessage('');
    try {
      setSelected(await saveFeaturedSelection(selected.map(p => p.id)));
      setMessage('تم حفظ ترتيب المنتجات المميزة.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  };
  return (
    <><DishCategorySettings onSaved={() => setCategoryRevision(value => value + 1)} /><section
      className="space-y-4 rounded-2xl border border-line bg-surface p-5"
      aria-label="المنتجات المميزة"
    >
      <h3 className="font-bold">أطباق مميزة اخترناها لك</h3>
      <p className="text-sm text-ink-muted">
        اختر حتى 24 طبقًا بصورة من المطاعم والمقاهي والحلويات والمخابز، ثم رتب ظهورها. المنتج المغلق أو غير المتاح يختفي من عرض العميل
        تلقائيًا. إذا لم تحدد أطباقًا، تظهر اقتراحات مصوّرة تلقائيًا من المتاجر المؤهلة.
      </p>
      <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto" aria-label="اختر المتجر">
        <button type="button" aria-pressed={!storeId} className="min-h-11 rounded-xl border border-line px-3 aria-pressed:bg-brand aria-pressed:text-white" onClick={() => { setStoreId(''); setPage(1); }}>جميع المطاعم والمقاهي</button>
        {stores.map(store => <button key={store.id} type="button" aria-pressed={storeId === store.id} className="min-h-11 rounded-xl border border-line px-3 aria-pressed:bg-brand aria-pressed:text-white" onClick={() => { setStoreId(store.id); setPage(1); }}>{store.nameAr}</button>)}
      </div>
      <button type="button" disabled={!ready || saving} onClick={() => { setSelected([]); setMessage('تم اختيار الوضع التلقائي: اضغط حفظ لتفعيله، بحد أقصى منتجين من كل متجر.'); }} className="min-h-11 rounded-xl border border-line px-4 font-bold text-brand">اختيار تلقائي — منتجان كحد أقصى لكل متجر</button>
      <label className="block text-sm">
        ابحث عن منتج
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(1); }}
          className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3"
        />
      </label>
      <div className="max-h-64 overflow-y-auto">
        {searching ? <p role="status">جارٍ تحميل المنتجات…</p> : results.map(product => (
          <button
            key={product.id}
            type="button"
            disabled={
              !ready ||
              saving ||
              !product.imageUrl ||
              selected.length >= 24 ||
              selected.some(p => p.id === product.id)
            }
            className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-line py-2 text-start disabled:opacity-50"
            onClick={() =>
              setSelected(rows => [
                ...rows,
                {
                  id: product.id,
                  nameAr: product.nameAr,
                  imageUrl: product.imageUrl,
                  isAvailable: product.isAvailable,
                  store: { nameAr: product.storeNameAr },
                },
              ])
            }
          >
            {product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" className="size-12 rounded-lg object-cover" />}
            <span className="flex-1">
              {product.nameAr} — {product.storeNameAr}
            </span>
            <span>{product.imageUrl ? 'إضافة' : 'تحتاج صورة'}</span>
          </button>
        ))}
      </div>
      {!searching && !results.length && <p className="text-sm text-ink-muted">لا توجد أطباق مؤهلة ضمن هذا البحث والأقسام المختارة.</p>}
      <div className="flex items-center justify-between"><button type="button" disabled={searching || page === 1} className="min-h-11 px-3 disabled:opacity-40" onClick={() => setPage(value => value - 1)}>السابق</button><span dir="ltr">{page} / {Math.max(1, Math.ceil(total / 12))}</span><button type="button" disabled={searching || page * 12 >= total} className="min-h-11 px-3 disabled:opacity-40" onClick={() => setPage(value => value + 1)}>التالي</button></div>
      <ol className="space-y-2">
        {selected.map((product, index) => (
          <li
            key={product.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2"
          >
            <span className="min-w-0 flex-1 text-sm">
              {index + 1}. {product.nameAr} — {product.store.nameAr}
            </span>
            <button
              className="min-h-11 min-w-11"
              type="button"
              disabled={saving || index === 0}
              aria-label={`تقديم ${product.nameAr}`}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              className="min-h-11 min-w-11"
              type="button"
              disabled={saving || index === selected.length - 1}
              aria-label={`تأخير ${product.nameAr}`}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              className="min-h-11 text-danger-ink"
              type="button"
              disabled={saving}
              onClick={() => setSelected(rows => rows.filter(p => p.id !== product.id))}
            >
              إزالة
            </button>
          </li>
        ))}
      </ol>
      {!selected.length && (
        <p className="text-sm text-ink-muted">لم تحدد أطباقًا يدويًا؛ ستظهر اقتراحات من الأقسام المسموحة أعلاه.</p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={!ready || saving}
        className="min-h-11 rounded-xl bg-brand px-4 font-bold text-white disabled:opacity-50"
      >
        {saving ? 'جارٍ الحفظ…' : 'حفظ المنتجات المميزة'}
      </button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </section></>
  );
}
