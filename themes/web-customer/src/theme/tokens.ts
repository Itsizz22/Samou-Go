/**
 * Samou' Go — design tokens, TypeScript mirror.
 *
 * The source of truth for colour is `src/index.css` (Tailwind v4 `@theme`).
 * This module exists ONLY for the places where a utility class cannot reach:
 *   - inline `style={{}}` (e.g. conic-gradient, computed bar heights)
 *   - SVG attributes that need a literal value (`fill`, `stroke`)
 *   - canvas / chart libraries
 *
 * Never use these constants where a class would do. See /DESIGN_SYSTEM.md
 */

export const tokens = {
  // Brand — Vibrant Emerald Green
  brand: '#10B981',
  brandDark: '#059669',
  brandDeep: '#047857',
  brandTint: '#D1FAE5',
  brandSurface: '#ECFDF5',
  brandSoft: '#6EE7B7',

  // Neutrals
  ink: '#111827',
  inkSoft: '#4B5563',
  inkMuted: '#6B7280',
  inkSubtle: '#9CA3AF',
  surface: '#FFFFFF',
  canvas: '#F3F4F6',
  line: '#E5E7EB',
  lineSoft: '#F3F4F6',

  // Status
  danger: '#EF4444',
  dangerTint: '#FEE2E2',
  dangerInk: '#B91C1C',
  warning: '#F59E0B',
  warningTint: '#FEF3C7',
  warningInk: '#B45309',
  info: '#3B82F6',
  infoTint: '#DBEAFE',
  infoInk: '#1D4ED8',
} as const;

export type ColorToken = keyof typeof tokens;

export const fontFamily = "'Tajawal', 'Cairo', system-ui, sans-serif" as const;

export const radius = {
  card: '0.75rem',
  panel: '1rem',
} as const;

export const shadow = {
  card: '0 1px 2px 0 rgb(17 24 39 / 0.05)',
  raised: '0 4px 12px -2px rgb(17 24 39 / 0.08)',
  brand: '0 8px 20px -4px rgb(16 185 129 / 0.35)',
} as const;

/**
 * Status → badge classes. The single place order/store statuses pick a colour,
 * so every screen renders the same status with the same tint.
 */
export const statusTone = {
  success: 'bg-brand-tint text-brand-deep',
  warning: 'bg-warning-tint text-warning-ink',
  info: 'bg-info-tint text-info-ink',
  danger: 'bg-danger-tint text-danger-ink',
  neutral: 'bg-canvas text-ink-muted',
} as const;

export type StatusTone = keyof typeof statusTone;
