/**
 * Samou' Go — Card / Panel / Section header.
 *
 * The three surfaces every app repeats: a plain card, a tappable card (used for
 * store and product tiles) and a panel for sheets. All three read their look
 * from the design system's `@layer components` classes.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift + press feedback; use for anything clickable. */
  interactive?: boolean;
  /** `panel` is the larger radius used by sheets and modals. */
  as?: 'card' | 'panel';
  padded?: boolean;
}

export function Card({
  interactive,
  as = 'card',
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  const base = as === 'panel' ? 'panel-surface' : interactive ? 'card-interactive' : 'card-surface';
  return (
    <div className={cn(base, padded && 'p-4', className)} {...rest}>
      {children}
    </div>
  );
}

export interface SectionHeaderProps {
  title: ReactNode;
  /** Secondary line under the title. */
  subtitle?: ReactNode;
  /** Trailing slot — "see all" links, filters, counts. */
  action?: ReactNode;
  className?: string;
}

/** The title row above a list or grid — same rhythm in all seven apps. */
export function SectionHeader({ title, subtitle, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-subheading font-bold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-caption text-ink-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
