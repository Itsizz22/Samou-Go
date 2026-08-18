/**
 * Samou' Go — active-language reader for the API client.
 *
 * The language mechanism lives in `@samou-go/ui` (`LanguageProvider`,
 * `LanguageToggle`): it persists `samou-go.language` in localStorage (shared
 * across all seven apps), broadcasts changes as a `samou-go:language`
 * CustomEvent, and applies `<html lang/dir>`. The API client cannot depend on
 * the UI package (it is consumed as TS source, ui from `dist/`), so it reads
 * the same storage key + event contract directly. Arabic is the default when
 * nothing is stored yet.
 *
 * `localizeMessage` collapses a canonical bilingual server message
 * (`"العربية / English"`) to the active locale at display time. Server messages
 * stay the single source of truth for both languages; only the final rendered
 * text collapses to one language.
 */

import { useSyncExternalStore } from 'react';

export type AppLanguage = 'ar' | 'en';

/** Shared with `packages/ui/src/lib/language.ts` — the cross-app contract. */
export const APP_LANGUAGE_STORAGE_KEY = 'samou-go.language';
export const LANGUAGE_CHANGE_EVENT = 'samou-go:language';

/** Reads the persisted language; Arabic when unset or unreadable. */
export function readAppLanguage(): AppLanguage {
  try {
    return localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

const subscribeLanguage = (onChange: () => void): (() => void) => {
  const onEvent = () => onChange();
  window.addEventListener(LANGUAGE_CHANGE_EVENT, onEvent);
  window.addEventListener('storage', onEvent);
  return () => {
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onEvent);
    window.removeEventListener('storage', onEvent);
  };
};

/** The active language, reactive to the toggle and to other tabs/apps. */
export function useAppLanguage(): AppLanguage {
  return useSyncExternalStore(subscribeLanguage, readAppLanguage);
}

const ARABIC_CHARS = /[\u0600-\u06FF]/;
const LATIN_START = /^[A-Za-z]/;

/**
 * Picks the active locale's side of a canonical bilingual string written as
 * `"العربية / English"`. Strings without that exact pattern (single-language
 * text, Latin-only phrases containing a slash) pass through unchanged, so a
 * plain message can never be mangled.
 */
export function localizeMessage(message: string, language: AppLanguage): string {
  const index = message.lastIndexOf(' / ');
  if (index < 0) return message;
  const ar = message.slice(0, index);
  const en = message.slice(index + 3);
  if (!ARABIC_CHARS.test(ar) || !LATIN_START.test(en)) return message;
  return language === 'ar' ? ar : en;
}