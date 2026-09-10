import { Pause, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@samou-go/ui';
import { useShowcaseCarousel } from '@/hooks/useShowcaseCarousel';
import { DEFAULT_HOME_BANNERS } from '@samou-go/shared-types';
import { usePlatformSettings } from '@samou-go/api-client';


/** Samou Quick announcements only; keep the shared swipe, pause and auto-advance behavior. */
export function PromoBannerSlider({ kind = 'announcement' }: { kind?: 'announcement' | 'product' }) {
  const { t, dir } = useLanguage();
  const settings = usePlatformSettings({ pollMs: 60000 });
  const slides = (settings.data?.homeBanners ?? DEFAULT_HOME_BANNERS).filter(slide => slide.enabled && (slide.kind ?? 'announcement') === kind && (kind !== 'product' || slide.storeId));
  const carousel = useShowcaseCarousel(slides.length, 5500);
  if (!slides.length) return null;
  return (
    <section className="mx-auto max-w-md px-5 pt-4" aria-label={kind === 'product' ? t('إعلانات المطاعم والمنتجات', 'Restaurant and product ads') : t('إعلانات سموع كويك', 'Samou Quick announcements')}>
      {kind === 'product' && <h2 className="mb-3 text-lg font-extrabold">{t('جرّب شيئًا لذيذًا', 'Find something delicious')}</h2>}
      <div
        data-swipe-back="off"
        {...carousel.bindings}
        className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
        style={{ touchAction: 'pan-y' }}
      >
        <div dir="ltr" className="flex" style={carousel.trackStyle} onTransitionEnd={carousel.onTransitionEnd}>
          {(slides.length > 1 ? [slides[slides.length - 1]!, ...slides, slides[0]!] : slides).map(({ id, title, imageUrl, positionY, storeId }, index) => (
            <div key={`${id}-${index}`} dir={dir} aria-hidden={index !== carousel.position} inert={index !== carousel.position} className="relative w-full min-w-0 flex-none">
              {kind === 'product' && storeId && <Link draggable={false} to={`/stores/${encodeURIComponent(storeId)}`} aria-label={`شاهد ${title} في المتجر`} className="absolute inset-0 z-10 rounded-2xl focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand" />}
              <img
                src={imageUrl}
                alt={title}
                width={1600}
                height={1066}
                draggable={false}
                style={{ objectPosition: `50% ${positionY}%`, objectFit: 'cover' }}
                className={`block w-full select-none ${kind === 'product' ? 'aspect-video' : 'aspect-[3/2]'}`}
                loading={index === carousel.position ? "eager" : "lazy"}
              />
              <h3 className="px-4 py-3 text-start text-sm font-bold text-ink bg-surface">{title}</h3>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
      {slides.length > 1 && <button type="button" onClick={() => carousel.setStopped(!carousel.stopped)} aria-label={carousel.stopped ? t('تشغيل البنرات', 'Play banners') : t('إيقاف البنرات مؤقتًا', 'Pause banners')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand">{carousel.stopped ? <Play size={16} /> : <Pause size={16} />}</button>}
      <div dir={dir} className="flex min-w-0 flex-1 justify-center overflow-x-auto">
        {slides.map(({ id, title }, index) => (
          <button
            key={id}
            type="button"
            onClick={() => carousel.setIndex(index)}
            aria-label={title}
            aria-pressed={carousel.active === index}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-brand"
          >
            <span className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${carousel.active === index ? 'w-6 bg-brand' : 'w-1.5 bg-brand-tint'}`} />
          </button>
        ))}
      </div>
      </div>
    </section>
  );
}
