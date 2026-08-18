/**
 * Samou' Go — HorizontalScrollGallery.
 *
 * A touch-friendly, RTL-aware horizontal rail with optional prev/next buttons.
 * Direction is resolved at scroll time from the element's computed style, so the
 * same component behaves correctly under both `dir="rtl"` (Arabic default) and
 * `dir="ltr"` (English mode). The scrollbar is hidden via a tiny scoped rule
 * injected by the component — the design-system `.scrollbar-none` utility is
 * *not* assumed, so this package stays self-contained.
 */
import React, { useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLanguage } from '../lib/LanguageProvider';

const TRACK_CLASS = 'samou-hscroll-track';

export interface HorizontalScrollGalleryProps {
  /** Arabic title shown above the rail. */
  titleAr?: string;
  /** Optional English subtitle (rendered as an LTR island). */
  titleEn?: string;
  /** Accessible label for the scroller. */
  ariaLabel?: string;
  /** Applied to the wrapping <section>. */
  className?: string;
  /** Applied to the scroll track itself (e.g. padding). */
  trackClassName?: string;
  /** Extra node rendered on the end of the title row (e.g. a "See all" action). */
  slotEnd?: React.ReactNode;
  /** Hide the prev/next buttons entirely (mobile strips usually do). */
  showArrows?: boolean;
  children: React.ReactNode;
}

const ArrowButton: React.FC<{ label: string; direction: 'prev' | 'next'; onClick: () => void }> = ({
  label,
  direction,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition hover:border-brand hover:bg-brand-surface hover:text-brand-deep active:scale-95"
  >
    {direction === 'prev' ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
  </button>
);

export const HorizontalScrollGallery: React.FC<HorizontalScrollGalleryProps> = ({
  titleAr,
  titleEn,
  ariaLabel,
  className,
  trackClassName,
  slotEnd,
  showArrows = true,
  children,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();
  const isArabic = language === 'ar';

  const scrollTo = useCallback((dir: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const isRtl = getComputedStyle(track).direction === 'rtl';
    const step = Math.min(Math.max(track.clientWidth * 0.8, 160), 420);
    track.scrollBy({ left: (isRtl ? -1 : 1) * dir * step, behavior: 'smooth' });
  }, []);

  // One title at a time — the active locale's version.
  const title = isArabic ? titleAr : titleEn ?? titleAr;
  const hasHeader = Boolean(title || slotEnd);

  return (
    <section className={cn('select-none', className)} aria-label={ariaLabel ?? title}>
      <style>{`.${TRACK_CLASS}{scrollbar-width:none;-ms-overflow-style:none}.${TRACK_CLASS}::-webkit-scrollbar{display:none}`}</style>

      {hasHeader && (
        <header className="mb-3 flex items-end justify-between gap-3">
          <div>{title && <h2 className="text-[15px] font-extrabold text-ink">{title}</h2>}</div>
          {slotEnd}
        </header>
      )}

      <div
        ref={trackRef}
        className={cn(TRACK_CLASS, 'flex gap-3 overflow-x-auto', trackClassName)}
      >
        {children}
      </div>

      {hasHeader && showArrows && (
        <div className="mt-2 flex items-center justify-end gap-1.5">
          <ArrowButton
            label={isArabic ? 'السابق' : 'Previous'}
            direction="prev"
            onClick={() => scrollTo(-1)}
          />
          <ArrowButton
            label={isArabic ? 'التالي' : 'Next'}
            direction="next"
            onClick={() => scrollTo(1)}
          />
        </div>
      )}
    </section>
  );
};

export default HorizontalScrollGallery;
