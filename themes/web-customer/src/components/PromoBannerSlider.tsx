import { useShowcaseCarousel } from '@/hooks/useShowcaseCarousel';
import { MapPin, Navigation, Package, PackageOpen } from 'lucide-react';
import { useLanguage } from '@samou-go/ui';

/**
 * PromoBannerSlider — two upcoming-features banners with RTL swipe,
 * auto-rotate, and pagination dots. Uses the brand emerald ramp and
 * warm-gold "قريباً" badges. Touch handlers follow the proven
 * touchDelta pattern verified in prior audit.
 */

const ROTATION_INTERVAL_MS = 5500;


/** Quick-touch icon wrapper that animates badge entrance. */
function GoldBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2.5 py-1 text-[10px] font-black text-ink shadow-sm">
      {children}
    </span>
  );
}

export function PromoBannerSlider() {
  const { t, dir } = useLanguage();
  const carousel = useShowcaseCarousel(2, ROTATION_INTERVAL_MS);
  const slide = carousel.active;
  const setSlide = carousel.setIndex;

  return (
    <section className="mx-auto max-w-md px-5 pt-5" aria-label="Feature banners">
      <div
        className="relative overflow-hidden rounded-2xl"
        {...carousel.bindings}
        style={{ touchAction: 'pan-y' }}
      >
        <div dir="ltr" className="flex" style={carousel.trackStyle}>
          {/* ---- Slide 1: Live Location Tracking ---- */}
          <div dir={dir} className="relative min-w-full rounded-2xl bg-linear-to-br from-brand-950 via-brand-800 to-brand-600 px-4 py-4 text-white">
            <div className="flex min-h-24 items-center justify-between gap-4">
              <div className="flex-1 text-start">
                <GoldBadge>
                  <Navigation size={10} className="text-ink" />
                  {t('قريباً', 'Coming soon')}
                </GoldBadge>
                <h3 className="mt-2 text-sm font-extrabold leading-snug text-white">
                  {t('إتاحة وتتبع الموقع المباشر', 'Live location tracking')}
                </h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/75">
                  {t(
                    'سنوفر قريباً ميزة تحديد موقعك بدقة وتتبع كابتن التوصيل على الخريطة لحظة بلحظة!',
                    'Soon: precise location & live captain tracking on the map!',
                  )}
                </p>
              </div>
              <div className="ms-3 flex shrink-0 flex-col items-center gap-1">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                  <MapPin size={26} className="text-warning" />
                </span>
                <Navigation size={16} className="text-white/50" />
              </div>
            </div>
          </div>

          {/* ---- Slide 2: Package Delivery ---- */}
          <div dir={dir} className="relative min-w-full rounded-2xl bg-linear-to-br from-slate-950 via-brand-900 to-brand-700 px-4 py-4 text-white">
            <div className="flex min-h-24 items-center justify-between gap-4">
              <div className="flex-1 text-start">
                <GoldBadge>
                  <Package size={10} className="text-ink" />
                  {t('قريباً', 'Coming soon')}
                </GoldBadge>
                <h3 className="mt-2 text-sm font-extrabold leading-snug text-white">
                  {t('خدمة نقل الطرود وتوصيل الأمانات', 'Package & parcel delivery')}
                </h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/75">
                  {t(
                    'من أي مكان في السموع إلى باب بيتك.. سنطلق قريباً خدمة نقل الطرود الخاصة والمشتريات السريعة.',
                    'From anywhere in Al-Samou\' to your doorstep — packages & fast shopping, coming soon.',
                  )}
                </p>
              </div>
              <div className="ms-3 flex shrink-0 flex-col items-center gap-1">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                  <PackageOpen size={26} className="text-white" />
                </span>
                <Package size={16} className="text-white/50" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pagination dots */}
      <div className="flex items-center justify-center">
        {[0, 1].map(i => (
          <button
            key={i}
            type="button"
            aria-label={i === 0 ? 'Live location banner' : 'Package delivery banner'}
            onClick={() => setSlide(i)}
            aria-pressed={slide === i}
            className="flex min-h-11 min-w-11 items-center justify-center"
          >
            <span
              className={`block h-1.5 rounded-full transition-all duration-300 ${
                slide === i ? 'w-6 bg-brand' : 'w-1.5 bg-brand-tint'
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
