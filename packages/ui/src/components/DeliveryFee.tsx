import React from 'react';
import { Truck } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLanguage } from '../lib/LanguageProvider';
import {
  CURRENCY,
  DELIVERY_FEE_LABEL,
  DELIVERY_FEE_LABEL_SHORT,
  FREE_DELIVERY_LABEL,
  formatCurrency,
  isFreeDelivery,
  type CurrencyOptions,
} from '../lib/delivery';

export type DeliveryFeeVariant = 'stacked' | 'inline' | 'badge' | 'row';

export interface DeliveryFeeProps {
  /** Fee in ILS. Always a number — never a pre-formatted string. */
  amount: number;
  variant?: DeliveryFeeVariant;
  /** Show the truck glyph next to the label. */
  showIcon?: boolean;
  /** Optional hint under the label, e.g. how the fee was derived. */
  note?: string;
  className?: string;
  currency?: CurrencyOptions;
}

/**
 * The only sanctioned way to render a delivery fee.
 *
 * Labels come from `src/lib/delivery.ts`, so changing the wording once changes
 * it in every screen. See /DESIGN_SYSTEM.md §8. Renders the active locale's
 * label only — one language at a time.
 *
 *   <DeliveryFee amount={3} />                    stacked  — label, then value
 *   <DeliveryFee amount={3} variant="inline" />   inline   — one short line
 *   <DeliveryFee amount={3} variant="badge" />    badge    — tinted pill
 *   <DeliveryFee amount={3} variant="row" />      row      — bill line, label ⋯ value
 */
export const DeliveryFee: React.FC<DeliveryFeeProps> = ({
  amount,
  variant = 'stacked',
  showIcon = false,
  note,
  className,
  currency,
}) => {
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const pick = (ar: string, en: string): string => (isArabic ? ar : en);

  const free = isFreeDelivery(amount);
  // Language-following free-delivery label vs. a money figure that stays in a
  // `dir="ltr"` island per DESIGN_SYSTEM.md (numbers/prices never reflow).
  const freeLabel = pick(FREE_DELIVERY_LABEL.ar, FREE_DELIVERY_LABEL.en);
  const price = formatCurrency(amount, currency);
  const priceCode = formatCurrency(amount, { unit: 'code' });

  if (variant === 'badge') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold',
          free ? 'bg-brand text-white' : 'bg-brand-tint text-brand-deep',
          className
        )}
        title={pick(DELIVERY_FEE_LABEL.ar, DELIVERY_FEE_LABEL.en)}
      >
        {showIcon && <Truck className="h-3 w-3" aria-hidden="true" />}
        <span>{pick(DELIVERY_FEE_LABEL_SHORT.ar, DELIVERY_FEE_LABEL_SHORT.en)}</span>
        {free ? freeLabel : <span dir="ltr">{price}</span>}
      </span>
    );
  }

  if (variant === 'inline') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-[11px] text-ink-muted', className)}
      >
        {showIcon && <Truck className="h-3.5 w-3.5 text-brand" aria-hidden="true" />}
        <span>{pick(DELIVERY_FEE_LABEL_SHORT.ar, DELIVERY_FEE_LABEL_SHORT.en)}</span>
        {free ? (
          <span className="font-bold text-brand-dark">{freeLabel}</span>
        ) : (
          <span dir="ltr" className="font-bold text-brand-dark">
            {price}
          </span>
        )}
      </span>
    );
  }

  if (variant === 'row') {
    return (
      <div className={cn('flex items-start justify-between gap-3', className)}>
        <dt className="text-ink-muted">
          <span className="flex items-center gap-1.5">
            {showIcon && <Truck className="h-4 w-4 text-brand" aria-hidden="true" />}
            {pick(DELIVERY_FEE_LABEL.ar, DELIVERY_FEE_LABEL.en)}
          </span>
          {note && <span className="mt-0.5 block text-[11px] text-ink-subtle">{note}</span>}
        </dt>
        <dd className="shrink-0 font-bold text-ink">
          {free ? freeLabel : <span dir="ltr">{priceCode}</span>}
        </dd>
      </div>
    );
  }

  return (
    <div className={cn('text-end', className)}>
      <p className="flex items-center justify-end gap-1.5 text-[11px] font-semibold text-ink-muted">
        {showIcon && <Truck className="h-3.5 w-3.5 text-brand" aria-hidden="true" />}
        {pick(DELIVERY_FEE_LABEL.ar, DELIVERY_FEE_LABEL.en)}
      </p>
      <p dir="ltr" className="mt-1 text-sm font-extrabold text-brand-dark">
        {free ? (
          <span dir={isArabic ? 'rtl' : 'ltr'}>{freeLabel}</span>
        ) : (
          <>
            {price}
            <span className="ms-1 text-[10px] font-semibold">{CURRENCY.code}</span>
          </>
        )}
      </p>
      {note && <p className="mt-0.5 text-[10px] text-ink-subtle">{note}</p>}
    </div>
  );
};

export default DeliveryFee;