import { Link } from 'react-router-dom';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
import { DEFAULT_HOME_BANNERS } from '@samou-go/shared-types';
import { usePlatformSettings } from '@samou-go/api-client';

/** Native, manual scrolling keeps a promotion still while the customer reads it. */
export function PromoBannerSlider({ kind = 'announcement' }: { kind?: 'announcement' | 'product' }) {
  const { t, dir } = useLanguage();
  const settings = usePlatformSettings({ pollMs: 60000 });
  const slides = (settings.data?.homeBanners ?? DEFAULT_HOME_BANNERS).filter(slide => slide.enabled && (slide.kind ?? 'announcement') === kind && (kind !== 'product' || slide.storeId));
  if (!slides.length) return null;
  return <section className="mx-auto max-w-md px-5 pt-4" aria-label={t('إعلانات سموع كويك', 'Samou Quick promotions')}>
    {kind === 'product' && <h2 className="mb-3 text-lg font-extrabold">{t('جرّب شيئًا لذيذًا', 'Find something delicious')}</h2>}
    <div dir={dir} data-swipe-back="off" tabIndex={0} role="region" aria-label={t('اسحب لاستعراض الإعلانات', 'Swipe to browse promotions')} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 scrollbar-none focus-visible:ring-2 focus-visible:ring-brand">
      {slides.map(({ id, title, imageUrl, positionY, storeId }) => <article key={id} className={`relative min-w-0 shrink-0 snap-start overflow-hidden rounded-2xl bg-surface ${slides.length > 1 ? 'basis-[94%]' : 'basis-full'}`}>
        {storeId && <Link draggable={false} to={`/stores/${encodeURIComponent(storeId)}`} aria-label={title} className="absolute inset-0 z-10 rounded-2xl focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand" />}
        <ImageWithFallback src={imageUrl} alt={title} className={`block w-full object-cover ${kind === 'product' ? 'aspect-video' : 'aspect-[3/2]'}`} style={{ objectPosition: `50% ${positionY ?? 50}%` }} />
        <h3 className="px-4 py-3 text-sm font-bold text-ink">{title}</h3>
      </article>)}
    </div>
    {slides.length > 1 && <p className="pt-1 text-center text-xs text-ink-muted">{t('اسحب للمزيد', 'Swipe for more')}</p>}
  </section>;
}
