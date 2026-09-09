import { MapPin, PackageOpen } from 'lucide-react';
import { useLanguage } from '@samou-go/ui';
import { useShowcaseCarousel } from '@/hooks/useShowcaseCarousel';
import bannerImage from '@/assets/home-banner.png';

/** Figma home 4:75; shared interactions retain the second upcoming service. */
export function PromoBannerSlider() {
  const { t, dir } = useLanguage();
  const carousel = useShowcaseCarousel(2, 5500);
  const slides = [
    {
      title: t('تابع حالة طلبك', 'Follow your order status'),
      description: t(
        'تابع تجهيز طلبك وتسليمه من صفحة الطلب. التتبع على الخريطة غير متاح حاليًا.',
        'Follow preparation and delivery on your order page. Live map tracking is not currently available.'
      ),
      Icon: MapPin,
    },
    {
      title: t('توصيل الطرود والأمانات', 'Package delivery'),
      description: t(
        'قريباً، توصيل طرودك ومشترياتك من أي مكان في السموع إلى باب بيتك.',
        'Coming soon: packages and shopping delivered to your door.'
      ),
      Icon: PackageOpen,
    },
  ];
  return (
    <section className="mx-auto max-w-md px-5 pt-4" aria-label="Feature banners">
      <div
        {...carousel.bindings}
        className="overflow-hidden rounded-[20px]"
        style={{ touchAction: 'pan-y' }}
      >
        <div dir="ltr" className="flex" style={carousel.trackStyle}>
          {slides.map(({ title, description, Icon }, index) => (
            <div
              key={index}
              dir={dir}
              aria-hidden={index !== carousel.active}
              className="relative flex min-w-full flex-row-reverse items-center gap-3 p-4 text-white"
            >
              <img
                src={bannerImage}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-slate-900/85" />
              <div className="relative min-w-0 flex-1 text-start">
                <h3 className="text-base font-bold leading-5 text-white">{title}</h3>
                <p className="mt-1 text-xs leading-4 text-white/90">{description}</p>
              </div>
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand">
                <Icon size={24} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div dir={dir} className="flex justify-center">
        {slides.map(({ title }, index) => (
          <button
            key={index}
            type="button"
            onClick={() => carousel.setIndex(index)}
            aria-label={title}
            aria-pressed={carousel.active === index}
            className="flex h-11 w-11 items-center justify-center"
          >
            <span
              className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${carousel.active === index ? 'w-6 bg-brand' : 'w-1.5 bg-brand-tint'}`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
