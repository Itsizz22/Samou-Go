/**
 * Samou' Go — Admin dark-mode toggle.
 *
 * Flips the `.dark` class on <html> (the design system's `@custom-variant`)
 * and persists the preference. `bootstrapApp({ allowDarkMode: true })` is
 * required in `main.tsx` so the forced-light listeners do not fight it.
 */
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@samou-go/ui';

export const ADMIN_DARK_STORAGE_KEY = 'samou-go.admin-dark';

function readStoredDark(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(ADMIN_DARK_STORAGE_KEY);
    if (stored !== null) return stored === '1';
  } catch {
    /* Private mode — fall back to the current DOM state. */
  }
  return document.documentElement.classList.contains('dark');
}

interface DarkModeToggleProps {
  className?: string;
}

export function DarkModeToggle({ className }: DarkModeToggleProps) {
  const [dark, setDark] = useState(readStoredDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      window.localStorage.setItem(ADMIN_DARK_STORAGE_KEY, dark ? '1' : '0');
    } catch {
      /* Private mode — session only. */
    }
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((value) => !value)}
      aria-label={dark ? 'الوضع الفاتح / Light mode' : 'الوضع الداكن / Dark mode'}
      aria-pressed={dark}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-canvas active:scale-95',
        className
      )}
    >
      {dark ? <Sun size={18} className="text-ink-soft" /> : <Moon size={18} className="text-ink-soft" />}
    </button>
  );
}

export default DarkModeToggle;