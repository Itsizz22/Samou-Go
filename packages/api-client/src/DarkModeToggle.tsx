/**
 * Samou' Go — shared dark-mode toggle button.
 *
 * A small, presentational switch wired to `useDarkMode`. Reuses the token layer
 * every theme's `index.css` defines (`bg-canvas`, `text-ink-soft`), so it needs
 * no CSS of its own and renders correctly in light and dark mode. `onDark`
 * restyles it for the brand-green headers (captain / store-manager) where the
 * surface is the header itself rather than the canvas.
 */

import { Moon, Sun } from 'lucide-react';
import { useDarkMode } from './useDarkMode';

export interface DarkModeToggleProps {
  /** localStorage key the preference is persisted under. */
  storageKey: string;
  /** Rendered on a dark brand header instead of the page canvas. */
  onDark?: boolean;
  className?: string;
}

export function DarkModeToggle({ storageKey, onDark = false, className }: DarkModeToggleProps) {
  const { dark, toggle } = useDarkMode(storageKey);

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

export default DarkModeToggle;