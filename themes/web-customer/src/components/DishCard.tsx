import { Link } from 'react-router-dom';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
import type { PopularProduct } from '@samou-go/shared-types';
import { ProductPhotoFallback } from './ProductPhotoFallback';
import { ProductPrice } from './ProductPrice';

export function DishCard({ product, onAdd }: { product: PopularProduct; onAdd: (product: PopularProduct) => void }) {
  const { t } = useLanguage();
  const href = `/stores/${encodeURIComponent(product.storeId)}?productId=${encodeURIComponent(product.id)}`;
  const customize = product.optionsEnabled && product.hasOptions;
  return <article className="dish-card flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-surface">
    <Link to={href} aria-label={t(`عرض ${product.nameAr}`, `View ${product.nameAr}`)} className="group block aspect-[4/5] overflow-hidden bg-canvas focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand">
      <ImageWithFallback src={product.imageUrl ?? undefined} fallback={<ProductPhotoFallback />} alt={product.nameAr} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-105 motion-reduce:transition-none" />
    </Link>
    <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
      <h3 className="line-clamp-2 min-h-14 text-lg font-extrabold leading-7"><Link to={href} className="focus-visible:ring-2 focus-visible:ring-brand">{product.nameAr}</Link></h3>
      <Link to={`/stores/${encodeURIComponent(product.storeId)}`} className="flex min-h-11 items-center gap-2 text-sm text-ink-muted focus-visible:ring-2 focus-visible:ring-brand">
        <ImageWithFallback src={product.storeLogoUrl ?? undefined} alt="" className="size-7 shrink-0 rounded-full object-contain" fallbackText={product.storeNameAr.slice(0, 1)} />
        <span className="line-clamp-2">{product.storeNameAr}</span>
      </Link>
      <div className="mt-auto text-xl font-extrabold text-brand"><ProductPrice product={product} /></div>
      <button type="button" disabled={!product.isAvailable} onClick={() => onAdd(product)} aria-label={`${t(customize ? 'تخصيص' : 'إضافة', customize ? 'Customize' : 'Add')} ${product.nameAr}`} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-2 text-sm font-bold text-white transition active:scale-95 hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50">
        {customize ? <SlidersHorizontal size={16} /> : <Plus size={16} />}
        {!product.isAvailable ? t('غير متاح', 'Unavailable') : t(customize ? 'تخصيص الطلب' : 'أضف للسلة', customize ? 'Customize' : 'Add to cart')}
      </button>
    </div>
  </article>;
}
