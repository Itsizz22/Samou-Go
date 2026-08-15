/**
 * Samou' Go — Skeleton.
 *
 * Reserves the final layout (no CLS) with a shimmer sweep. The animation is
 * pure CSS (`.skeleton::after`), so it costs nothing on the JS side and honours
 * `prefers-reduced-motion` through the global guard in the design system.
 */
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/utils';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Convenience shapes for the two most common placeholders. */
  shape?: 'block' | 'text' | 'circle';
}

const SHAPE_CLASS = {
  block: '',
  text: 'h-3.5 rounded-pill',
  circle: 'aspect-square rounded-pill',
} as const;

export function Skeleton({ shape = 'block', className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton', SHAPE_CLASS[shape], className)}
      {...rest}
    />
  );
}

export interface SkeletonListProps {
  /** How many rows to draw. */
  count?: number;
  className?: string;
  rowClassName?: string;
}

/** A stack of card-shaped placeholders — the store/order list loading state. */
export function SkeletonList({ count = 4, className, rowClassName }: SkeletonListProps) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={cn('h-20 rounded-card', rowClassName)} />
      ))}
    </div>
  );
}
