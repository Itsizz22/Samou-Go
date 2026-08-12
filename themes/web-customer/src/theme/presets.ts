/**
 * Samou' Go — accent theme presets.
 *
 * Shared by the navigation drawer's quick switcher and the Settings screen.
 * The `swatch` hex mirrors the `--color-brand` value each accent class applies
 * in `index.css`; it is only used for inline swatch dots (a Tailwind arbitrary
 * class generated from a variable would never be emitted).
 */

import type { AccentTheme } from './ThemeProvider';

export interface AccentOption {
  key: AccentTheme;
  /** Inline swatch dot — must match the CSS `--color-brand` of that theme. */
  swatch: string;
  labelAr: string;
  labelEn: string;
}

export const ACCENT_OPTIONS: AccentOption[] = [
  { key: 'emerald', swatch: '#10b981', labelAr: 'زمردي', labelEn: 'Emerald' },
  { key: 'warm-yellow', swatch: '#f59e0b', labelAr: 'أصفر دافئ', labelEn: 'Warm Yellow' },
  { key: 'muted-red', swatch: '#e57373', labelAr: 'وردي هادئ', labelEn: 'Muted Red' },
];