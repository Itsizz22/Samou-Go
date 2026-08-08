/**
 * Shimmering skeleton primitives — replace every spinner with a layout-stable
 * placeholder. The shimmer is a GPU-friendly background-position slide so it
 * stays cheap on mid-range Android WebViews.
 */
import type { ReactNode } from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton shimmer ${className}`} />;
}

/** A store-card-shaped placeholder used while the catalogue loads. */
export function StoreCardSkeleton() {
  return (
    <div className="min-w-[196px] overflow-hidden rounded-2xl bg-surface shadow-card" aria-hidden="true">
      <Skeleton className="h-24 w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="ms-auto h-3 w-2/3" />
        <Skeleton className="ms-auto h-2.5 w-1/2" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

/** A compact list-row placeholder for store lists and order history. */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card" aria-hidden="true">
      <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="ms-auto h-3 w-1/2" />
        <Skeleton className="ms-auto h-2.5 w-2/3" />
      </div>
      <Skeleton className="h-6 w-12 shrink-0 rounded-full" />
    </div>
  );
}

/** A product-row placeholder for the catalogue / cart. */
export function ProductRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card" aria-hidden="true">
      <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="ms-auto h-3.5 w-1/2" />
        <Skeleton className="ms-auto h-3 w-1/4" />
      </div>
      <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
    </div>
  );
}

export function SkeletonGrid({
  count = 3,
  render,
}: {
  count?: number;
  render: () => ReactNode;
}) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>{render()}</div>
      ))}
    </div>
  );
}
