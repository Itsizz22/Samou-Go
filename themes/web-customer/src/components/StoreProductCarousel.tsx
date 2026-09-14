import type { Product } from '@samou-go/shared-types';
import { HorizontalScrollGallery, ImageWithFallback, useLanguage } from '@samou-go/ui';
import { ArrowUpLeft } from 'lucide-react';
import { ProductPrice } from './ProductPrice';

export function StoreProductCarousel({ products, onSelect }: { products: Product[]; onSelect: (product: Product) => void }) {
  const { t } = useLanguage();
  const seen = new Set<string>();
  const slides = products.filter(product => {
    if (!product.isAvailable || !product.imageUrl || seen.has(product.imageUrl)) return false;
    seen.add(product.imageUrl);
    return true;
  }).slice(0, 8);
  if (slides.length < 2) return null;
  return (
    <div className="sq-store-carousel" data-swipe-back="off">
      <HorizontalScrollGallery titleAr="من قائمة المتجر" titleEn="Explore the menu" ariaLabel={t('صور منتجات المتجر', 'Store product photos')} className="mx-auto max-w-md" trackClassName="sq-store-carousel-track" slotEnd={<span className="text-xs text-ink-muted">{t('اسحب وشاهد', 'Swipe to explore')} <span aria-hidden="true">↔</span></span>}>
        {slides.map(product => (
          <button key={product.id} type="button" className="sq-store-carousel-slide" aria-label={t(`شاهد ${product.nameAr}`, `View ${product.nameAr}`)} onClick={() => onSelect(product)}>
            <ImageWithFallback src={product.imageUrl!} alt={product.nameAr} className="sq-store-carousel-image" />
            <span className="sq-store-carousel-caption">
              <span className="min-w-0 flex-1"><strong className="block line-clamp-2 text-base font-extrabold">{product.nameAr}</strong><span className="mt-1 block text-sm font-bold" dir="ltr"><ProductPrice product={product} /></span></span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20"><ArrowUpLeft size={20} className="ltr:rotate-90" /></span>
            </span>
          </button>
        ))}
      </HorizontalScrollGallery>
    </div>
  );
}
