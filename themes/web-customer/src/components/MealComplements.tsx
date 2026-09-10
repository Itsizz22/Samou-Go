import { useState } from 'react';
import { Plus } from 'lucide-react';
import { classifyStore, ImageWithFallback, useLanguage } from '@samou-go/ui';
import { normalizeOptionGroups, resolveSelectedOptions, type Product } from '@samou-go/shared-types';
import { useStore } from '@/hooks/useApi';
import { useCart, type CartStoreGroup } from './CartProvider';
import { ProductOptionsSheet } from './ProductOptionsSheet';
import { storeIsOpen } from './StoreHours';
import { mealComplements } from '@/lib/mealComplements';
import { formatCurrency } from '@/lib/delivery';
import { hapticConfirm } from '@/lib/haptics';

export function MealComplements({ group }: { group: CartStoreGroup }) {
  const { data: store } = useStore(group.storeId);
  const cart = useCart();
  const { t } = useLanguage();
  const [selected, setSelected] = useState<Product | null>(null);
  if (!store || !storeIsOpen(store) || classifyStore(store) !== 'restaurant') return null;
  const products = mealComplements(store, new Set(group.lines.map(line => line.productId)));
  if (!products.length && !selected) return null;
  return <section className="mt-5 rounded-2xl border border-line bg-surface p-4" aria-label={t('أكمل وجبتك', 'Complete your meal')}>
    <h2 className="font-extrabold text-ink">{t('أكمل وجبتك', 'Complete your meal')}</h2>
    <p className="mt-1 text-xs text-ink-muted">{group.storeNameAr} · {t('إضافات اختيارية', 'Optional extras')}</p>
    <div className="mt-3 space-y-3">
      {products.map(product => {
        const hasOptions = product.optionsEnabled && normalizeOptionGroups(product.optionGroups).length > 0;
        return <div key={product.id} className="flex items-center gap-3">
          <ImageWithFallback src={product.imageUrl ?? undefined} alt="" fallbackText={product.nameAr.slice(0, 1)} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1"><p className="text-sm font-bold">{product.nameAr}</p><p className="text-xs text-brand-dark"><span dir="ltr">{formatCurrency(product.price)}</span></p></div>
          <button type="button" aria-label={`${t('إضافة', 'Add')} ${product.nameAr}`} className="flex min-h-11 items-center gap-1 rounded-xl bg-brand-tint px-3 text-xs font-bold text-brand-dark focus-visible:outline-2 focus-visible:outline-brand" onClick={() => {
            if (hasOptions) { setSelected(product); return; }
            cart.addItem(product, 1, '', group.storeNameAr); void hapticConfirm();
          }}><Plus size={16} />{hasOptions ? t('تخصيص', 'Customize') : t('إضافة', 'Add')}</button>
        </div>;
      })}
    </div>
    {selected && <ProductOptionsSheet product={selected} storeNameAr={group.storeNameAr} onClose={() => setSelected(null)} onConfirm={(options, quantity) => {
      cart.addItem(selected, quantity, '', group.storeNameAr, resolveSelectedOptions(selected.optionGroups, options));
      setSelected(null); void hapticConfirm();
    }} />}
  </section>;
}
