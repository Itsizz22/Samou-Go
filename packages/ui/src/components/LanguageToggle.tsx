/**
 * Samou' Go — shared language toggle button.
 *
 * A circular AR/EN switch wired to the reactive `useLanguage` context. Uses
 * only token utilities (`bg-surface`, `text-ink-soft`, `border-line`) so it
 * renders on every Samou' Go surface. `onDark` restyles it for brand-green
 * headers (captain / store-manager) where the surface is the header itself.
 *
 * The single `samou-go.language` storage key + `samou-go:language` CustomEvent
 * are shared across all seven apps, so a flip in one portal is honoured
 * everywhere — same contract as `ThemeToggle`.
 */

import { Languages } from 'lucide-react';
import { useLanguage } from '../lib/LanguageProvider';

export interface LanguageToggleProps {
  /** Rendered on a dark brand header instead of the page canvas. */
  onDark?: boolean;
  className?: string;
}

export function LanguageToggle({ onDark = false, className }: LanguageToggleProps) {
  const { language, toggleLanguage } = useLanguage();
  const isArabic = language === 'ar';

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-pressed={!isArabic}
      aria-label={isArabic ? 'English' : 'العربية'}
      title={isArabic ? 'English' : 'العربية'}
      className={
        `flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold transition active:scale-95 ` +
        (onDark ? 'text-white/90 hover:bg-surface/15' : 'text-ink-soft hover:bg-canvas') +
        (className ? ` ${className}` : '')
      }
    >
      <Languages size={16} />
      <span dir="ltr">{isArabic ? 'EN' : 'عربي'}</span>
    </button>
  );
}

export default LanguageToggle;