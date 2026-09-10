import { useLanguage } from '@samou-go/ui';
import { useShowcaseCarousel } from '@/hooks/useShowcaseCarousel';
import { DEFAULT_HOME_BANNERS } from '@samou-go/shared-types';
import { usePlatformSettings } from '@samou-go/api-client';


/** Samou Quick announcements only; keep the shared swipe, pause and auto-advance behavior. */
export function PromoBannerSlider() {
  const { t, dir } = useLanguage();
  const settings = usePlatformSettings({ pollMs: 60000 });
  const slides = (settings.data?.homeBanners ?? DEFAULT_HOME_BANNERS).filter(slide => slide.enabled);
  const carousel = useShowcaseCarousel(slides.length, 5500);
  if (!slides.length) return null;
  return (
    <section className="mx-auto max-w-md px-5 pt-4" aria-label={t('إعلانات سموع كويك', 'Samou Quick announcements')}>
      <div
        {...carousel.bindings}
        className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
        style={{ touchAction: 'pan-y' }}
      >
        <div dir="ltr" className="flex" style={carousel.trackStyle}>
          {slides.map(({ id, title, imageUrl, fit, positionY }, index) => (
            <div key={id} dir={dir} aria-hidden={index !== carousel.active} className="w-full min-w-0 flex-none">
              <img
                src={imageUrl}
                alt={title}
                width={1600}
                height={1066}
                draggable={false}
                style={{ objectPosition: `50% ${positionY}%`, objectFit: fit }}
                className="block h-44 w-full select-none sm:h-52"
              />
              <h3 className="px-4 py-3 text-start text-sm font-bold text-ink bg-surface">{title}</h3>
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
