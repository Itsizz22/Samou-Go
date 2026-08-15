/**
 * Samou' Go — Button.
 *
 * Wraps the canonical `.btn-*` classes from the design system so every app gets
 * the same 44px touch target, press feedback and brand focus ring without
 * re-typing utility strings. Styling deliberately lives in CSS (`@layer
 * components`), not in a className string here — utilities referenced only from
 * this package are not in any app's Tailwind scan root.
 */
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  icon: 'btn-icon',
};

/** `md` is the CSS default, so it adds nothing. */
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-2 text-xs',
  md: '',
  lg: 'min-h-12 px-5 py-3.5 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container — the default for sheet and form actions. */
  block?: boolean;
  /** Swaps the label for a spinner and blocks input. */
  loading?: boolean;
  /** Rendered before the label (after it in RTL, since the row is flex). */
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, icon, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(VARIANT_CLASS[variant], SIZE_CLASS[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

/** Inline spinner — `currentColor` so it works on every variant. */
function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
