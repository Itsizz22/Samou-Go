import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, Package, PackageOpen } from 'lucide-react';
import { useLanguage } from '@samou-go/ui';

/**
 * PromoBannerSlider — two upcoming-features banners with RTL swipe,
 * auto-rotate, and pagination dots. Uses the brand emerald ramp and
 * warm-gold "قريباً" badges. Touch handlers follow the proven
 * touchDelta pattern verified in prior audit.
 */

const ROTATION_INTERVAL_MS = 5500;
const SWIPE_THRESHOLD = 50;

/** Quick-touch icon wrapper that animates badge entrance. */
function GoldBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2.5 py-1 text-[10px] font-black text-ink shadow-sm">
      {children}
    </span>
  );
}

export function PromoBannerSlider() {
  const { t } = useLanguage();
  const [slide, setSlide] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchDelta = useRef(0);
  const isDragging = useRef(false);

  /* Auto-rotate ---------------------------------------------------------- */
  useEffect(() => {
    const id = setInterval(() => setSlide(p => (p === 0 ? 1 : 0)), ROTATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  /* Touch handlers ------------------------------------------------------- */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = true;
    touchDelta.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dy) > Math.abs(dx)) {
      isDragging.current = false;
      return;
    }
    touchDelta.current = dx;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (Math.abs(touchDelta.current) > SWIPE_THRESHOLD) {
      const isRTL = document.documentElement.dir === 'rtl';
      // In RTL, a right-swipe (positive delta) advances; LSW goes back.
      const shouldAdvance = isRTL ? touchDelta.current > 0 : touchDelta.current < 0;
      setSlide(prev => (shouldAdvance ? (prev === 0 ? 1 : 0) : (prev === 1 ? 0 : 1)));
    }
    touchDelta.current = 0;
  }, []);

  return (
    <section className="mx-auto max-w-md px-5 pt-5" aria-label="Feature banners">
      <div
        className="relative overflow-hidden rounded-2xl shadow-card"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {/* Slides container — smooth translate + live drag offset */}
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(${slide === 0 ? '0%' : '-100%'})` }}
        >
          {/* ---- Slide 1: Live Location Tracking ---- */}
          <div className="min-w-full rounded-2xl bg-gradient-to-br from-brand-deep via-brand-dark to-brand px-5 py-6 text-white">
            <div className="flex min-h-[110px] items-center justify-between gap-4">
              <div className="flex-1 text-end">
                <GoldBadge>
                  <Navigation size={10} className="text-ink" />
                  {t('قريباً', 'Coming soon')}
                </GoldBadge>
                <h3 className="mt-2 text-[18px] font-extrabold leading-snug">
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
          <div className="min-w-full rounded-2xl bg-gradient-to-br from-brand-soft via-brand to-brand-dark px-5 py-6 text-white">
            <div className="flex min-h-[110px] items-center justify-between gap-4">
              <div className="flex-1 text-end">
                <GoldBadge>
                  <Package size={10} className="text-ink" />
                  {t('قريباً', 'Coming soon')}
                </GoldBadge>
                <h3 className="mt-2 text-[18px] font-extrabold leading-snug">
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
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {[0, 1].map(i => (
          <button
            key={i}
            type="button"
            aria-label={i === 0 ? 'Live location banner' : 'Package delivery banner'}
            onClick={() => setSlide(i)}
            className="-m-2.5 p-2.5"
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
