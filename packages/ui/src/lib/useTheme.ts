/**
 * Samou' Go — `useTheme` React hook.
 *
 * Wraps the unified theme primitives (see `./theme.ts`) in a reactive hook so
 * any app can read and switch light/dark/system without owning its own
 * provider. Listens to `prefers-color-scheme` so `system` stays live.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  applyThemeMode,
  getStoredThemeMode,
  persistThemeMode,
  resolveDark,
  type ThemeMode,
} from './theme';

export interface UseTheme {
  mode: ThemeMode;
  dark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export function useTheme(): UseTheme {
  const [mode, setModeState] = useState<ThemeMode>(getStoredThemeMode);
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    applyThemeMode(mode);
    persistThemeMode(mode);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const toggle = useCallback(
    () => setModeState((current) => resolveDark(current, prefersDark) ? 'light' : 'dark'),
    [prefersDark]
  );

  return { mode, dark: resolveDark(mode, prefersDark), setMode, toggle };
}

export default useTheme;