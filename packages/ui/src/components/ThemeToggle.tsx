/**
 * Samou' Go — unified theme toggle button.
 *
 * Presentational switch wired to the shared `useTheme`. Uses only token
 * utilities (`bg-canvas`, `text-ink-soft`) so it renders correctly in light and
 * dark mode and on every Samou' Go surface. `onDark` restyles it for brand-green
 * headers (captain / store-manager) where the surface is the header itself.
 *
 * The single `samou_theme` storage key is shared across all seven apps, so a
 * toggle in one portal is honoured everywhere.
 */

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/useTheme';

export interface ThemeToggleProps {
  /** Rendered on a dark brand header instead of the page canvas. */
  onDark?: boolean;
  className?: string;
}

export function ThemeToggle({ onDark = false, className }: ThemeToggleProps) {
  const { dark, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'الوضع الفاتح / Light mode' : 'الوضع الداكن / Dark mode'}
      className={
        `flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 ` +
        (onDark ? 'text-white/90 hover:bg-surface/15' : 'text-ink-soft hover:bg-canvas') +
        (className ? ` ${className}` : '')
      }
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export default ThemeToggle;