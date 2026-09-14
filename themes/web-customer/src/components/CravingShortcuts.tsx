import { Link } from 'react-router-dom';
import { Pizza, Sandwich, Flame, CakeSlice, Drumstick, Coffee, Croissant } from 'lucide-react';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';

const cravings = [
  { ar: 'بيتزا', en: 'Pizza', image: '/images/home/cravings/pizza.webp', icon: Pizza },
  { ar: 'برغر', en: 'Burgers', image: '/images/home/cravings/burger.webp', icon: Sandwich },
  { ar: 'مشاوي', en: 'Grills', image: '/images/home/cravings/grills.webp', icon: Flame },
  { ar: 'شاورما', en: 'Shawarma', image: '/images/home/cravings/shawarma.webp', icon: Sandwich },
  { ar: 'حلويات', en: 'Desserts', image: '/images/home/cravings/desserts.webp', icon: CakeSlice },
  { ar: 'قهوة', en: 'Coffee', image: '/images/home/cravings/coffee.webp', icon: Coffee },
  { ar: 'مخبوزات', en: 'Bakery', image: '/images/home/cravings/bakery.webp', icon: Croissant },
  { ar: 'دجاج', en: 'Chicken', image: '/images/home/cravings/chicken.webp', icon: Drumstick },
];

export function CravingShortcuts() {
  const { t } = useLanguage();
  return <section className="mx-auto my-5 max-w-md px-5" aria-labelledby="cravings-title">
    <h2 id="cravings-title" className="mb-3 text-lg font-bold text-ink">{t('ماذا تشتهي اليوم؟', 'What are you craving?')}</h2>
    <img src="/images/home/cravings-spread-1440.webp" srcSet="/images/home/cravings-spread-720.webp 720w, /images/home/cravings-spread-1440.webp 1440w" sizes="(min-width: 1200px) 1160px, calc(100vw - 40px)" alt="" width={1440} height={480} loading="lazy" decoding="async" className="mb-4 block aspect-[3/1] w-full rounded-2xl object-cover" />
    <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-2 scrollbar-none" data-swipe-back="off">
      {cravings.map(({ ar, en, image, icon: Icon }) => {        return <Link key={ar} to={`/search?q=${encodeURIComponent(ar)}`} className="group flex w-20 shrink-0 flex-col items-center gap-2 rounded-2xl p-1 text-center focus-visible:outline-2 focus-visible:outline-brand">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-brand-surface text-brand-dark ring-1 ring-line transition-transform motion-safe:group-hover:scale-105">
            <ImageWithFallback src={image} alt="" className="h-full w-full object-cover" fallback={<Icon size={28} />} />
          </span>
          <span className="text-xs font-bold text-ink">{t(ar, en)}</span>
        </Link>;
      })}
    </div>
  </section>;
}
