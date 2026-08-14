/**
 * Samou' Go — unified theme system.
 *
 * Single source of truth for the light/dark/system theme across all seven
 * apps. One localStorage key (`samou_theme`) is shared by every front-end so a
 * preference chosen in one portal (customer, store-manager, captain, admin) is
 * honoured everywhere else without per-app keys.
 *
 *  - `mode`   : 'light' | 'dark' | 'system'
 *  - `.dark`  : toggled on `<html>` (Tailwind v4 `@custom-variant dark`).
 *  - `system` : resolves through `prefers-color-scheme` and live-updates.
 *
 * Legacy keys (`samou-go.*-dark` = '1'/'0', `samou.theme.mode`) are read once
 * on first boot and migrated into `samou_theme`, so existing users keep their
 * preference.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'samou_theme';

/** Resolve a 'system' preference into the concrete light/dark boolean. */
export function resolveDark(mode: ThemeMode, prefersDark = false): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark);
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Toggle the `.dark` class on `<html>` to match the given mode. */
export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolveDark(mode, systemPrefersDark()));
}

/** Write the mode to localStorage (best-effort, for private mode). */
export function persistThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* Private mode — in-memory only. */
  }
}

const LEGACY_KEYS = ['samou-go.store-manager-dark', 'samou-go.captain-dark', 'samou-go.admin-dark'] as const;

/**
 * Read the persisted theme mode. Falls back through the legacy per-app keys so
 * an existing dark preference is not lost when this unified key is introduced.
 */
export function getStoredThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* fall through to legacy reads */
  }
  try {
    for (const key of LEGACY_KEYS) {
      if (window.localStorage.getItem(key) === '1') return 'dark';
    }
    if (window.localStorage.getItem('samou.theme.mode') === 'dark') return 'dark';
  } catch {
    /* ignore */
  }
  return 'system';
}

/**
 * Inline script for `index.html` — applies the stored theme BEFORE React
 * mounts, eliminating the flash-of-light-mode on reload. Inject between
 * `<head>` tags; keep it dependency-free.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{
  var m=(localStorage.getItem('samou_theme')||'system');
  var t=(m==='dark'||m==='system')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark=(m==='dark')||(m==='system'&&t)||
    (m!=='light'&&m!=='dark'&&m!=='system'&&
      (localStorage.getItem('samou-go.store-manager-dark')==='1'||
       localStorage.getItem('samou-go.captain-dark')==='1'||
       localStorage.getItem('samou-go.admin-dark')==='1'||
       localStorage.getItem('samou.theme.mode')==='dark'));
  if(dark){document.documentElement.classList.add('dark');}
})();`;