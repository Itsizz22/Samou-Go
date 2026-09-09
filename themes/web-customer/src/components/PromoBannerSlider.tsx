import { useLanguage } from '@samou-go/ui';
import { useShowcaseCarousel } from '@/hooks/useShowcaseCarousel';
import parcelImage from '@/assets/promo-parcel-delivery.jpeg';
import trackingImage from '@/assets/promo-map-tracking.jpeg';

/** Upcoming services only; keep the shared swipe, pause and auto-advance behavior. */
export function PromoBannerSlider() {
  const { t, dir } = useLanguage();
  const carousel = useShowcaseCarousel(2, 5500);
  const slides = [
    {
      title: t('قريباً: توصيل الطرود', 'Coming soon: parcel delivery'),
      image: parcelImage,
    },
    {
      title: t('قريباً: تتبع الطلب على الخريطة', 'Coming soon: live order tracking on the map'),
      image: trackingImage,
    },
  ];
  return (
    <section className="mx-auto max-w-md px-5 pt-4" aria-label={t('إعلانات الخدمات القادمة', 'Upcoming services')}>
      <div
        {...carousel.bindings}
        className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
        style={{ touchAction: 'pan-y' }}
      >
        <div dir="ltr" className="flex" style={carousel.trackStyle}>
          {slides.map(({ title, image }, index) => (
            <div key={image} dir={dir} aria-hidden={index !== carousel.active} className="min-w-full shrink-0">
              <img
                src={image}
                alt={title}
                width={1600}
                height={1066}
                draggable={false}
                className="block h-auto w-full select-none"
              />
            </div>
          ))}
        </div>
      </div>
      <div dir={dir} className="flex justify-center">
        {slides.map(({ title }, index) => (
          <button
            key={title}
            type="button"
            onClick={() => carousel.setIndex(index)}
            aria-label={title}
            aria-pressed={carousel.active === index}
            className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-brand"
          >
            <span className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${carousel.active === index ? 'w-6 bg-brand' : 'w-1.5 bg-brand-tint'}`} />
          </button>
        ))}
      </div>
    </section>
  );
}
