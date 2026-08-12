/**
 * Samou' Go — app bootstrap utility.
 *
 * Consolidates the 60-line setup block that every `main.tsx` used to repeat
 * verbatim. Call `bootstrapApp()` once at the top of `main.tsx` before
 * rendering the React tree.
 *
 * What it does:
 *   1. Disables Framer Motion animations in editable/preview mode
 *   2. Forces the app into light mode (dark mode is not implemented yet)
 *   3. Attaches a global broken-image fallback handler
 *
 * The `MotionGlobalConfig` import is lazy (dynamic) so this module does not
 * drag Framer Motion into a bundle that never uses it — though in practice
 * every Samou' Go app depends on it anyway.
 */

export interface BootstrapOptions {
  /** Extra override — disable animations regardless of URL params. */
  skipAnimations?: boolean;
  /**
   * Opt out of the forced-light-mode listeners. Apps that ship their own
   * theme switcher (dark mode toggle) set this to `true` and manage the
   * `.dark` class themselves; everyone else keeps the safe light default.
   */
  allowDarkMode?: boolean;
}

export type BrandTheme = 'emerald' | 'crimson';
export type AppLanguage = 'ar' | 'en';

const BRAND_THEME_STORAGE_KEY = 'samou-go.brand-theme';
const APP_LANGUAGE_STORAGE_KEY = 'samou-go.language';

/** Applies the visual theme without coupling any app to a specific settings UI. */
export function setBrandTheme(theme: BrandTheme): void {
  document.documentElement.classList.toggle('theme-crimson', theme === 'crimson');
  try {
    localStorage.setItem(BRAND_THEME_STORAGE_KEY, theme);
  } catch {
    /* Private mode still receives the in-memory DOM update. */
  }
}

/** Sets the document language/direction used by the direction-aware design system. */
export function setAppLanguage(language: AppLanguage): void {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  try {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* Private mode still receives the in-memory DOM update. */
  }
}

/**
 * One-liner bootstrap for every Samou' Go Vite app.
 *
 * ```ts
 * // main.tsx
 * import { bootstrapApp } from '@samou-go/ui';
 * bootstrapApp();
 * ```
 */
export function bootstrapApp(options: BootstrapOptions = {}): void {
  /* ---- 1. Framer Motion animation toggle -------------------------------- */
  const urlParams = new URLSearchParams(window.location.search);
  const skipViaUrl =
    urlParams.get('shouldSkipAnimations') === 'true' ||
    urlParams.get('mode') === 'editable';

  if (skipViaUrl || options.skipAnimations) {
    // Dynamic import so the call site doesn't need to depend on framer-motion
    // at the module level — the function is called once synchronously anyway.
    import('framer-motion')
      .then(({ MotionGlobalConfig }) => {
        MotionGlobalConfig.skipAnimations = true;
      })
      .catch(() => {
        /* framer-motion not installed in this workspace — ignore */
      });
  }

  /* ---- 2. Force light mode ---------------------------------------------- */
  const forceLightMode = (): void => {
    document.documentElement.classList.toggle('dark', false);
  };

  if (!options.allowDarkMode) {
    forceLightMode();
    document.addEventListener('DOMContentLoaded', forceLightMode);
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', forceLightMode);
  }

  /* ---- 2b. Brand theme --------------------------------------------------- */
  try {
    setBrandTheme(localStorage.getItem(BRAND_THEME_STORAGE_KEY) === 'crimson' ? 'crimson' : 'emerald');
  } catch {
    setBrandTheme('emerald');
  }
  window.addEventListener('samou-go:brand-theme', event => {
    const requested = event instanceof CustomEvent && event.detail === 'crimson' ? 'crimson' : 'emerald';
    setBrandTheme(requested);
  });

  /* ---- 2c. Language and direction -------------------------------------- */
  const queryLanguage = urlParams.get('lang');
  let language: AppLanguage = queryLanguage === 'en' ? 'en' : 'ar';
  try {
    const stored = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    if (!queryLanguage && stored === 'en') language = 'en';
  } catch {
    /* Default Arabic-first language remains active. */
  }
  setAppLanguage(language);
  window.addEventListener('samou-go:language', event => {
    const requested = event instanceof CustomEvent && event.detail === 'en' ? 'en' : 'ar';
    setAppLanguage(requested);
  });

  /* ---- 3. Broken-image fallback ----------------------------------------- */
  const FALLBACK_SVG =
    `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'` +
    ` viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'` +
    ` stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18'` +
    ` height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E` +
    `%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E`;

  document.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (target.dataset['fallbackApplied']) return;
      target.dataset['fallbackApplied'] = 'true';
      target.src = FALLBACK_SVG;
      target.classList.add('broken-image-fallback');
      if (!target.alt || target.alt.trim() === '') {
        target.alt = 'Image not available';
      }
    },
    true // capture so it fires before the default handler
  );
}
