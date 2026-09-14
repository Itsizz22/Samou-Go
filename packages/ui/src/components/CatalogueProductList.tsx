import { useEffect, useRef, useState } from 'react';
import { Archive, Expand, Loader2, Package, Pencil, X } from 'lucide-react';
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
  const [failedImages, setFailedImages] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Product | null>(null);
  return <><div className="sq-catalogue-grid">
    {products.map(product => {
      const hasImage = Boolean(product.imageUrl && failedImages[product.id] !== product.imageUrl);
      return <article key={product.id} className="sq-catalogue-product" aria-label={product.nameAr}>
      <div className="sq-catalogue-summary">
        <button type="button" className="sq-catalogue-photo" onClick={() => hasImage ? setPreview(product) : onEdit(product)} aria-label={`${hasImage ? t('عرض صورة', 'View image of') : t('إضافة صورة إلى', 'Add image to')} ${product.nameAr}`}>
          <ImageWithFallback src={product.imageUrl ?? undefined} onError={() => { if (product.imageUrl) setFailedImages(previous => ({ ...previous, [product.id]: product.imageUrl! })); }} alt="" width={120} height={120} loading="lazy" decoding="async" className="sq-catalogue-image" fallback={<span className="sq-catalogue-placeholder"><Package size={26}/><span>{t('إضافة صورة', 'Add image')}</span></span>} />
          {hasImage && <span className="sq-catalogue-expand" aria-hidden="true"><Expand size={14}/></span>}
        </button>
        <button type="button" className="sq-catalogue-details" onClick={() => onEdit(product)} aria-label={`${t('تعديل', 'Edit')} ${product.nameAr}`}>

          <span className="sq-catalogue-category">{product.categoryName || t('بدون قسم', 'Uncategorized')}</span>
          <span className="sq-catalogue-name">{product.nameAr}</span>
          <span className="sq-catalogue-price"><bdi dir="ltr">{formatPrice(product.price)}</bdi>{product.originalPrice != null && product.originalPrice > product.price && <del dir="ltr">{formatPrice(product.originalPrice)}</del>}</span>
        </button>
      </div>
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
    </article>; })}
  </div>
    {preview && <ProductImagePreview product={preview} onClose={() => setPreview(null)} />}
  </>;
}

function ProductImagePreview({ product, onClose }: { product: Product; onClose: () => void }) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return <dialog ref={dialogRef} className="sq-product-image-dialog" aria-label={`${t('صورة', 'Image of')} ${product.nameAr}`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sq-product-image-view">
      <header><h2>{product.nameAr}</h2><button type="button" autoFocus onClick={onClose} aria-label={t('إغلاق الصورة', 'Close image')}><X size={22}/></button></header>
      <ImageWithFallback src={product.imageUrl ?? undefined} alt={product.nameAr} loading="eager" decoding="async" className="sq-product-image-full" fallback={<span className="sq-product-image-error"><Package size={32}/>{t('تعذر تحميل الصورة', 'Unable to load image')}</span>} />
    </div>
  </dialog>;
}
