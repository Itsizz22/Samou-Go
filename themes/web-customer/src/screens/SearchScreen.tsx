import { useEffect, useState } from 'react';
import { normalizeOptionGroups, resolveSelectedOptions, type PopularProduct } from '@samou-go/shared-types';
import { ScreenShell } from '@/components/ScreenShell';
import { CatalogueSearchField } from '@/components/CatalogueSearchField';
import { HomeProductSearch } from '@/components/HomeProductSearch';
import { ProductOptionsSheet } from '@/components/ProductOptionsSheet';
import { useCart } from '@/components/CartProvider';
import { hapticConfirm } from '@/lib/haptics';

export function SearchScreen() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [optionsProduct, setOptionsProduct] = useState<PopularProduct | null>(null);
  const cart = useCart();
  useEffect(() => { const timer = window.setTimeout(() => setQuery(term.trim()), 350); return () => window.clearTimeout(timer); }, [term]);
  const add = (product: PopularProduct) => {
    if (product.optionsEnabled && product.hasOptions && normalizeOptionGroups(product.optionGroups).length) { setOptionsProduct(product); return; }
    cart.addItem(product, 1, '', product.storeNameAr);
    void hapticConfirm();
  };
  return <ScreenShell title="البحث" subtitle="Search">
    <CatalogueSearchField value={term} onChange={setTerm} onSearch={() => setQuery(term.trim())} />
    <p className="mt-3 text-xs leading-6 text-ink-muted">ابحث عن منتجاتك المفضلة أو عن متجر قريب منك.</p>
    {term.trim() !== query ? <p role="status" className="py-6 text-sm text-ink-muted">جارٍ البحث…</p> : <HomeProductSearch key={query} query={query} onAdd={add} contained />}
    {optionsProduct && <ProductOptionsSheet product={optionsProduct} storeNameAr={optionsProduct.storeNameAr} onClose={() => setOptionsProduct(null)} onConfirm={(options, quantity) => {
      cart.addItem(optionsProduct, quantity, '', optionsProduct.storeNameAr, resolveSelectedOptions(optionsProduct.optionGroups, options));
      setOptionsProduct(null); void hapticConfirm();
    }} />}
  </ScreenShell>;
}
