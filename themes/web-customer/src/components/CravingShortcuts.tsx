import { Link } from 'react-router-dom';
import { Pizza, Sandwich, Flame, CakeSlice, Drumstick } from 'lucide-react';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
import type { Product } from '@samou-go/shared-types';

const cravings = [
  { ar: 'بيتزا', en: 'Pizza', match: /بيتزا|pizza/i, icon: Pizza },
  { ar: 'برغر', en: 'Burgers', match: /برغر|برجر|burger/i, icon: Sandwich },
  { ar: 'مشاوي', en: 'Grills', match: /مشاوي|كباب|grill/i, icon: Flame },
  { ar: 'شاورما', en: 'Shawarma', match: /شاورما|shawarma/i, icon: Sandwich },
  { ar: 'حلويات', en: 'Desserts', match: /حلويات|كنافة|كيك|dessert|cake/i, icon: CakeSlice },
  { ar: 'دجاج', en: 'Chicken', match: /دجاج|chicken/i, icon: Drumstick },
];

export function CravingShortcuts({ products }: { products: Product[] }) {
  const { t } = useLanguage();
  return <section className="mx-auto my-5 max-w-md px-5" aria-labelledby="cravings-title">
    <h2 id="cravings-title" className="mb-3 text-lg font-bold text-ink">{t('ماذا تشتهي اليوم؟', 'What are you craving?')}</h2>
    <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-2 scrollbar-none" data-swipe-back="off">
      {cravings.map(({ ar, en, match, icon: Icon }) => {
        const photo = products.find(product => product.isAvailable && product.imageUrl && match.test(product.nameAr));
        return <Link key={ar} to={`/search?q=${encodeURIComponent(ar)}`} className="group flex w-20 shrink-0 flex-col items-center gap-2 rounded-2xl p-1 text-center focus-visible:outline-2 focus-visible:outline-brand">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-brand-surface text-brand-dark ring-1 ring-line transition-transform motion-safe:group-hover:scale-105">
            {photo?.imageUrl ? <ImageWithFallback src={photo.imageUrl} alt="" className="h-full w-full object-cover" /> : <Icon size={28} />}
          </span>
          <span className="text-xs font-bold text-ink">{t(ar, en)}</span>
        </Link>;
      })}
    </div>
  </section>;
}
