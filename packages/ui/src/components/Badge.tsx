/**
 * Samou' Go — Badge.
 *
 * One vocabulary of status pills. `tone` maps onto the design system's
 * `.badge-*` classes; `ORDER_STATUS_TONES` in @samou-go/shared-types already
 * speaks this vocabulary, so an order status maps straight through.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';

export type BadgeTone = 'brand' | 'success' | 'warning' | 'info' | 'danger' | 'neutral';

const TONE_CLASS: Record<BadgeTone, string> = {
  brand: 'badge-brand',
  success: 'badge-success',
  warning: 'badge-warning',
  info: 'badge-info',
  danger: 'badge-danger',
  neutral: 'badge-neutral',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Small leading dot — reads faster than colour alone. */
  dot?: boolean;
  icon?: ReactNode;
}

export function Badge({ tone = 'neutral', dot, icon, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn(TONE_CLASS[tone], className)} {...rest}>
      {dot ? <span className="size-1.5 rounded-pill bg-current" aria-hidden="true" /> : icon}
      {children}
    </span>
  );
}
