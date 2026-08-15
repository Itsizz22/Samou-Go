/**
 * Samou' Go — language + direction primitives.
 *
 * The design system is Arabic-first RTL with English `dir="ltr"` islands, so a
 * "language switch" flips BOTH the written locale and the document direction.
 * These primitives are the single source of truth for that switch:
 *
 *   - `samou-go.language` in localStorage (shared across all seven apps).
 *   - `?lang=en` URL override, honoured before storage.
 *   - `document.documentElement.lang/dir` applied to the DOM.
 *   - A `samou-go:language` CustomEvent so bootstrap listeners and every app
 *     stay in sync no matter which app flipped the toggle.
 */

export type AppLanguage = 'ar' | 'en';

const APP_LANGUAGE_STORAGE_KEY = 'samou-go.language';
export const LANGUAGE_CHANGE_EVENT = 'samou-go:language';

/** Reads the effective language: URL `?lang=` wins, then storage, then Arabic. */
export function resolveInitialLanguage(): AppLanguage {
  const params = new URLSearchParams(window.location.search);
  if (params.get('lang') === 'en') return 'en';
  try {
    if (localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) === 'en') return 'en';
  } catch {
    /* Private mode — fall back to the Arabic default. */
  }
  return 'ar';
}

/** Applies a language to the document and persists it. Does not dispatch. */
export function applyAppLanguage(language: AppLanguage): void {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  try {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* Private mode still receives the in-memory DOM update. */
  }
}

/** Broadcasts a language change to bootstrap listeners + other apps. */
export function announceAppLanguage(language: AppLanguage): void {
  window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: language }));
}