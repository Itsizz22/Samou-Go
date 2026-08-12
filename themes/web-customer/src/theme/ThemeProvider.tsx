/**
 * Samou' Go — client-side theme switching.
 *
 * Two independent axes, both persisted to localStorage:
 *   - `accent`: the brand hue — Default emerald / Warm Yellow / Muted Red.
 *   - `mode`:   light / dark.
 *
 * The accent is applied as a class on `<html>` (`theme-warm-yellow`,
 * `theme-muted-red`) that re-declares the `--color-brand*` and `--primary`-style
 * custom properties `@theme` emits in `index.css`. Because Tailwind v4
 * utilities resolve through `var(--color-*)`, every `bg-brand`, `text-brand-dark`,
 * `badge-brand`, header and `shadow-brand` utility re-tints instantly when the
 * class toggles. `mode` flips the pre-existing `.dark` class.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type AccentTheme = 'emerald' | 'warm-yellow' | 'muted-red';
export type ColorMode = 'light' | 'dark';

export interface ThemeState {
  accent: AccentTheme;
  mode: ColorMode;
  setAccent: (accent: AccentTheme) => void;
  setMode: (mode: ColorMode) => void;
}

/** Accent classes the provider manages — removes any stale sibling (`theme-crimson`). */
const ACCENT_CLASSES = ['theme-warm-yellow', 'theme-muted-red', 'theme-crimson'] as const;

const ACCENT_STORAGE_KEY = 'samou.theme.accent';
const MODE_STORAGE_KEY = 'samou.theme.mode';

const ACCENTS: readonly AccentTheme[] = ['emerald', 'warm-yellow', 'muted-red'];
const MODES: readonly ColorMode[] = ['light', 'dark'];

function readStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored && (allowed as readonly string[]).includes(stored)) return stored as T;
  } catch {
    /* Private mode — fall through to the default. */
  }
  return fallback;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentTheme>(() =>
    readStored(ACCENT_STORAGE_KEY, 'emerald', ACCENTS)
  );
  const [mode, setModeState] = useState<ColorMode>(() =>
    readStored(MODE_STORAGE_KEY, 'light', MODES)
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      /* Private mode — theme still applies in-memory. */
    }
  }, [accent, mode]);

  useEffect(() => {
    const root = document.documentElement;
    for (const cls of ACCENT_CLASSES) root.classList.remove(cls);
    if (accent === 'warm-yellow' || accent === 'muted-red') {
      root.classList.add(`theme-${accent}`);
    }
    root.classList.toggle('dark', mode === 'dark');
  }, [accent, mode]);

  const value = useMemo<ThemeState>(
    () => ({
      accent,
      mode,
      setAccent: setAccentState,
      setMode: setModeState,
    }),
    [accent, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}