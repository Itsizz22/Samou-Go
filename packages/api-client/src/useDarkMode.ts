/**
 * Samou' Go — shared dark-mode hook.
 *
 * Reads the `.dark` class off `<html>` (the design system's `@custom-variant`)
 * and persists the preference under the given localStorage key. Every app that
 * calls `bootstrapApp({ allowDarkMode: true })` in `main.tsx` may use this —
 * the forced-light listeners only run when `allowDarkMode` is false/omitted, so
 * they never fight the toggle here.
 *
 * React state drives the DOM: toggling writes the class + storage immediately
 * so the whole tree re-renders dark in the same commit.
 */

import { useCallback, useEffect, useState } from 'react';

/** Apply + persist the current dark preference to `<html>` and localStorage. */
function applyDark(dark: boolean, storageKey: string): void {
  document.documentElement.classList.toggle('dark', dark);
  try {
    window.localStorage.setItem(storageKey, dark ? '1' : '0');
  } catch {
    /* Private mode — theme still applies in-memory for this session. */
  }
}

function readStoredDark(storageKey: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) return stored === '1';
  } catch {
    /* Private mode — fall back to the current DOM state. */
  }
  return document.documentElement.classList.contains('dark');
}

export interface DarkMode {
  dark: boolean;
  toggle: () => void;
  setDark: (dark: boolean) => void;
}

/** Toggle state kept in sync with `<html>.dark` and a localStorage key. */
export function useDarkMode(storageKey: string): DarkMode {
  const [dark, setDarkState] = useState(() => readStoredDark(storageKey));

  useEffect(() => {
    applyDark(dark, storageKey);
  }, [dark, storageKey]);

  const toggle = useCallback(() => setDarkState((value) => !value), []);
  const setDark = useCallback((value: boolean) => setDarkState(value), []);

  return { dark, toggle, setDark };
}