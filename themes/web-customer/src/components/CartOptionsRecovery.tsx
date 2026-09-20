import { useState } from 'react';
import { getStore } from '@samou-go/api-client';
import { resolveSelectedOptions, type Product } from '@samou-go/shared-types';
import { useCart, cartLineKey, type CartLine } from './CartProvider';
import { ProductOptionsSheet } from './ProductOptionsSheet';

const optionCodes = new Set(['INVALID_OPTION_GROUP', 'INVALID_OPTION', 'OPTION_MIN_REQUIRED', 'OPTION_MAX_EXCEEDED', 'DUPLICATE_OPTION']);
export function isCartOptionsError(code?: string): boolean { return !!code && optionCodes.has(code); }

/** Explicitly reselect from the live catalogue; never silently drop paid options. */
export function CartOptionsRecovery({ onUpdated }: { onUpdated: () => void }) {
  const cart = useCart();
  const [editing, setEditing] = useState<{ line: CartLine; product: Product } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function review(line: CartLine) {
    setLoading(true); setError('');
    try {
      const store = await getStore(line.storeId);
      const product = store.categories.flatMap(category => category.products).find(item => item.id === line.productId);
      if (!product || !product.isAvailable) { setError('هذا المنتج لم يعد متاحًا. يمكنك حذفه من السلة.'); return; }
      setEditing({ line, product: product.optionsEnabled === false ? { ...product, optionGroups: [] } : product });
    } catch { setError('تعذر تحميل الخيارات الحالية. حاول مجددًا.'); }
    finally { setLoading(false); }
  }
  return <section className="rounded-2xl border border-line bg-surface p-4" role="alert">
    <h3 className="font-bold">تغيّرت خيارات أحد المنتجات</h3>
    <p className="mt-2 text-sm text-ink-muted">راجع خيارات المنتجات لتحديث السلة وحساب السعر من جديد.</p>
    {cart.lines.filter(line => !line.isOfferItem).map(line => <div key={cartLineKey(line)} className="mt-3 flex flex-wrap items-center gap-2">
      <span className="flex-1 text-sm">{line.product.nameAr}</span>
      <button type="button" disabled={loading} className="min-h-11 rounded-xl bg-brand px-3 text-sm text-white disabled:opacity-50" onClick={() => void review(line)}>مراجعة الخيارات</button>
      <button type="button" className="min-h-11 px-2 text-sm text-danger-ink" onClick={() => { cart.removeItem(cartLineKey(line)); onUpdated(); }}>حذف</button>
    </div>)}
    {error && <p className="mt-2 text-sm text-danger-ink">{error}</p>}
    {editing && <ProductOptionsSheet key={cartLineKey(editing.line)} product={editing.product} storeNameAr={editing.line.storeNameAr} initialQuantity={editing.line.quantity} onClose={() => setEditing(null)} onConfirm={(options, quantity) => {
      cart.replaceLine(cartLineKey(editing.line), editing.product, resolveSelectedOptions(editing.product.optionGroups, options), quantity);
      setEditing(null); onUpdated();
    }} />}
  </section>;
}
