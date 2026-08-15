/**
 * Samou' Go — `LanguageProvider` React context + `useLanguage` hook.
 *
 * The reactive counterpart to the DOM-level `setAppLanguage` bootstrap util.
 * Holds the active `AppLanguage` in React state, applies it to the document
 * (`<html lang/dir>`), persists it, and broadcasts the `samou-go:language`
 * CustomEvent so the non-React bootstrap listener and every other Samou' Go
 * app stay in sync — flipping the toggle in one app is honoured everywhere.
 *
 * Wrap the app root:
 *
 * ```tsx
 * <LanguageProvider>
 *   <App />
 * </LanguageProvider>
 * ```
 *
 * Any component can then read the active language reactively:
 *
 * ```tsx
 * const { language, setLanguage, t } = useLanguage();
 * ```
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  announceAppLanguage,
  applyAppLanguage,
  resolveInitialLanguage,
  type AppLanguage,
} from '../lib/language';

export interface LanguageContextValue {
  language: AppLanguage;
  /** `'rtl'` for Arabic, `'ltr'` for English — mirrors the document direction. */
  dir: 'rtl' | 'ltr';
  setLanguage: (next: AppLanguage) => void;
  /** Flips between Arabic and English. */
  toggleLanguage: () => void;
  /** Picks the string for the active language — `t('مرحباً', 'Hello')`. */
  t: (ar: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(resolveInitialLanguage);

  // On change: apply to the document, persist, and announce to every listener.
  useEffect(() => {
    applyAppLanguage(language);
    announceAppLanguage(language);
  }, [language]);

  // Stay in sync with changes made elsewhere (bootstrap `?lang=` at boot, or
  // another app's toggle broadcasting the same CustomEvent).
  useEffect(() => {
    const onLanguageEvent = (event: Event) => {
      const next = event instanceof CustomEvent && event.detail === 'en' ? 'en' : 'ar';
      setLanguageState((current) => (current === next ? current : next));
    };
    window.addEventListener('samou-go:language', onLanguageEvent);
    return () => window.removeEventListener('samou-go:language', onLanguageEvent);
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => setLanguageState(next), []);
  const toggleLanguage = useCallback(
    () => setLanguageState((current) => (current === 'ar' ? 'en' : 'ar')),
    []
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      dir: language === 'ar' ? 'rtl' : 'ltr',
      setLanguage,
      toggleLanguage,
      t: (ar, en) => (language === 'ar' ? ar : en),
    }),
    [language, setLanguage, toggleLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a <LanguageProvider>.');
  return ctx;
}

export default LanguageProvider;