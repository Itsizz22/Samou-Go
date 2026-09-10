import type { Product } from '@samou-go/shared-types';
import { formatCurrency } from '@/lib/delivery';
export function ProductPrice({ product }: { product: Pick<Product, 'price' | 'originalPrice'> }) {
  const original = product.originalPrice;
  const discounted = original != null && original > product.price;
  return <span className="inline-flex flex-wrap items-center gap-2" dir="ltr">
    {discounted && <del className="text-xs font-normal text-ink-muted">{formatCurrency(original)}</del>}
    <span>{formatCurrency(product.price)}</span>
    {discounted && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-bold text-brand-deep">−{Math.round((1 - product.price / original) * 100)}%</span>}
  </span>;
}
