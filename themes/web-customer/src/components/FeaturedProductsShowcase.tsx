import { useState } from 'react';
import { useLanguage } from '@samou-go/ui';
import type { PopularProduct } from '@samou-go/shared-types';
import { DishCard } from './DishCard';

export function FeaturedProductsShowcase({ products, loading, onAdd }: { products: PopularProduct[]; loading: boolean; onAdd: (product: PopularProduct) => void }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  if (!products.length && !loading) return null;
  return <section className="mx-auto max-w-md px-5 pt-6" aria-label={t('أطباق مميزة اخترناها لك', 'Featured dishes picked for you')} aria-busy={loading}>
    <div className="mb-4"><p className="mb-1 text-xs font-bold text-brand">{t('اختيارات سموع كويك', 'Samou Quick picks')}</p><h2 className="text-xl font-extrabold">{t('أطباق مميزة اخترناها لك', 'Featured dishes picked for you')}</h2></div>
    <div className="grid grid-cols-2 gap-3">
      {loading && !products.length ? [0, 1].map(key => <div key={key} className="skeleton h-80 rounded-2xl" aria-hidden="true" />) : products.slice(0, expanded ? products.length : 4).map(product => <DishCard key={product.id} product={product} onAdd={onAdd} />)}
    </div>
    {products.length > 4 && <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="mt-3 min-h-11 w-full rounded-xl border border-line bg-surface text-sm font-bold text-brand focus-visible:ring-2 focus-visible:ring-brand">{expanded ? t('عرض أقل', 'Show less') : t('شاهد جميع الأطباق المميزة', 'See all featured dishes')}</button>}
  </section>;
}
