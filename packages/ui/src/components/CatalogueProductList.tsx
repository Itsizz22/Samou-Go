import { Archive, Loader2, Package, Pencil } from 'lucide-react';
import type { Product } from '@samou-go/shared-types';
import { useLanguage } from '../lib/LanguageProvider';
import { ImageWithFallback } from './ImageWithFallback';

interface Props {
  products: (Product & { categoryName: string })[];
  togglingId: string | null;
  deactivatingId: string | null;
  onEdit: (product: Product) => void;
  onToggle: (product: Product) => void;
  onDeactivate: (product: Product) => void;
  formatPrice: (price: number) => string;
}

export function CatalogueProductList({ products, togglingId, deactivatingId, onEdit, onToggle, onDeactivate, formatPrice }: Props) {
  const { t } = useLanguage();
  return <div className="sq-catalogue-grid">
    {products.map(product => <article key={product.id} className="sq-catalogue-product" aria-label={product.nameAr}>
      <button type="button" className="sq-catalogue-summary" onClick={() => onEdit(product)} aria-label={`${t('تعديل', 'Edit')} ${product.nameAr}`}>
        <span className="sq-catalogue-photo">
          <ImageWithFallback src={product.imageUrl ?? undefined} alt="" width={108} height={108} loading="lazy" decoding="async" className="sq-catalogue-image" fallback={<span className="sq-catalogue-placeholder"><Package size={28}/></span>} />
        </span>
        <span className="sq-catalogue-details">
          <span className="sq-catalogue-category">{product.categoryName || t('بدون قسم', 'Uncategorized')}</span>
          <span className="sq-catalogue-name">{product.nameAr}</span>
          <span className="sq-catalogue-price"><bdi dir="ltr">{formatPrice(product.price)}</bdi>{product.originalPrice != null && product.originalPrice > product.price && <del dir="ltr">{formatPrice(product.originalPrice)}</del>}</span>
        </span>
      </button>
      <div className="sq-catalogue-actions">
        <button type="button" role="switch" aria-checked={product.isAvailable} aria-label={`${t('توفّر', 'Availability of')} ${product.nameAr}`} disabled={togglingId === product.id} onClick={() => onToggle(product)} className="sq-catalogue-availability">
          <span className="sq-catalogue-switch" aria-hidden="true"><span>{togglingId === product.id && <Loader2 size={12} className="animate-spin"/>}</span></span>
          <span>{product.isAvailable ? t('متاح', 'Available') : t('غير متاح', 'Unavailable')}</span>
        </button>
        <div className="sq-catalogue-tools">
          <button type="button" onClick={() => onEdit(product)} className="sq-catalogue-edit"><Pencil size={15}/>{t('تعديل', 'Edit')}</button>
          <button type="button" onClick={() => onDeactivate(product)} disabled={deactivatingId === product.id} className="sq-catalogue-archive" aria-label={`${t('إيقاف', 'Deactivate')} ${product.nameAr}`} title={t('إيقاف المنتج', 'Deactivate product')}>{deactivatingId === product.id ? <Loader2 size={16} className="animate-spin"/> : <Archive size={16}/>}</button>
        </div>
      </div>
    </article>)}
  </div>;
}
