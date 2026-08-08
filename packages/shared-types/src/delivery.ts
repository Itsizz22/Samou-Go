/**
 * Samou' Go — delivery fee. THE single source of truth.
 *
 * The API imports `calculateDeliveryFee` from here when creating an order, and
 * the front-ends mirror this file in `src/lib/delivery.ts` (see DESIGN_SYSTEM.md
 * §8). No screen and no controller may hardcode the string "رسوم التوصيل",
 * "Delivery Fee", "ILS" or "₪", and none may carry a fee as a pre-formatted
 * string like `'3 ILS'`.
 *
 * Business rule, Samou' / Hebron, as of 2026-07:
 *   fewer than 5 items  → 3 ₪
 *   5 items or more     → 5 ₪
 *   empty basket        → 0 ₪
 */

export type Locale = 'ar' | 'en';

import type { VoucherDiscountType } from './enums';

export const CURRENCY = {
  code: 'ILS',
  symbol: '₪',
} as const;

/** The canonical bilingual label. */
export const DELIVERY_FEE_LABEL = {
  ar: 'رسوم التوصيل',
  en: 'Delivery Fee',
} as const;

/** Shorter form for tight spaces (badges, card corners). */
export const DELIVERY_FEE_LABEL_SHORT = {
  ar: 'التوصيل',
  en: 'Delivery',
} as const;

export const FREE_DELIVERY_LABEL = {
  ar: 'توصيل مجاني',
  en: 'Free delivery',
} as const;

/**
 * A tiered, item-count-based tariff. Stored per-store one day; for now a single
 * platform-wide default. `bulkThreshold` is inclusive of `bulkFee`.
 */
export interface DeliveryFeeConfig {
  /** Fee when `itemCount < bulkThreshold`, in ILS. */
  baseFee: number;
  /** Fee when `itemCount >= bulkThreshold`, in ILS. */
  bulkFee: number;
  /** Item count at which `bulkFee` takes over. */
  bulkThreshold: number;
  /** ISO 4217 code the fees are denominated in. */
  currency: typeof CURRENCY.code;
}

export const DEFAULT_DELIVERY_FEE_CONFIG: DeliveryFeeConfig = {
  baseFee: 3,
  bulkFee: 5,
  bulkThreshold: 5,
  currency: CURRENCY.code,
};

/**
 * Fee for an order, derived purely from item count.
 * An empty basket is free — never charge for nothing.
 */
export function calculateDeliveryFee(
  itemCount: number,
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_FEE_CONFIG
): number {
  if (!Number.isFinite(itemCount) || itemCount <= 0) return 0;
  return itemCount >= config.bulkThreshold ? config.bulkFee : config.baseFee;
}

/**
 * The bilingual label, joined however the caller needs it.
 * `'both'` is the house style: Arabic first, Latin second.
 */
export function deliveryFeeLabel(locale: Locale | 'both' = 'both', short = false): string {
  const dict = short ? DELIVERY_FEE_LABEL_SHORT : DELIVERY_FEE_LABEL;
  if (locale === 'ar') return dict.ar;
  if (locale === 'en') return dict.en;
  return `${dict.ar} / ${dict.en}`;
}

export interface CurrencyOptions {
  /** `'symbol'` → ₪12.00 · `'code'` → 12.00 ILS · `'none'` → 12.00 */
  unit?: 'symbol' | 'code' | 'none';
  /** Decimal places. Defaults to 2, or 0 when the amount is a whole number. */
  decimals?: number;
}

/** Formats a bare amount. Never call `.toFixed()` on money at a call site. */
export function formatCurrency(amount: number, options: CurrencyOptions = {}): string {
  const { unit = 'symbol', decimals } = options;
  const places = decimals ?? (Number.isInteger(amount) ? 0 : 2);
  const value = amount.toFixed(places);

  if (unit === 'symbol') return `${CURRENCY.symbol}${value}`;
  if (unit === 'code') return `${value} ${CURRENCY.code}`;
  return value;
}

/** `"رسوم التوصيل / Delivery Fee: ₪3"` — label and amount in one string. */
export function formatDeliveryFee(
  amount: number,
  options: CurrencyOptions & { locale?: Locale | 'both'; short?: boolean } = {}
): string {
  const { locale = 'both', short = false, ...currency } = options;
  return `${deliveryFeeLabel(locale, short)}: ${formatCurrency(amount, currency)}`;
}

/** `true` when the order qualifies for free delivery. */
export function isFreeDelivery(amount: number): boolean {
  return amount <= 0;
}

/**
 * Money helper — rounds to 2 decimals without float drift
 * (`0.1 + 0.2` style errors accumulate fast across order items).
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Line total for a single basket row. */
export function lineTotal(unitPrice: number, quantity: number): number {
  return roundMoney(unitPrice * quantity);
}

export interface OrderTotals {
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
}

/**
 * The whole bill in one call — the API and the checkout screen must agree
 * to the fils, so both go through this function.
 */
export function calculateOrderTotals(
  lines: readonly { unitPrice: number; quantity: number }[],
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_FEE_CONFIG
): OrderTotals {
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = roundMoney(
    lines.reduce((sum, line) => sum + lineTotal(line.unitPrice, line.quantity), 0)
  );
  const deliveryFee = calculateDeliveryFee(itemCount, config);

  return {
    itemCount,
    subtotal,
    deliveryFee,
    totalAmount: roundMoney(subtotal + deliveryFee),
  };
}

/* ---------------------------------------------------------------------------
 * Vouchers / discounts
 *
 * The discount is computed HERE, in the single source of truth, so the API and
 * the checkout screen agree to the fils. The client only ever sends a voucher
 * CODE — the server resolves it and applies `calculateVoucherDiscount`. The
 * "client never sends money" invariant is untouched.
 * ------------------------------------------------------------------------- */

/** The pricing-relevant fields of a voucher, shared with the front-end mirror. */
export interface VoucherPricing {
  type: VoucherDiscountType;
  /** PERCENT → 0–100; FIXED → ILS amount off. */
  value: number;
  /** The voucher only applies once the basket's subtotal is at least this. */
  minSubtotal?: number;
  /** Hard cap on the savings (matters for PERCENT vouchers). */
  maxDiscount?: number;
}

/**
 * The savings a voucher produces on a given subtotal, rounded to the fils.
 * Never returns a negative or an amount larger than the basket itself.
 */
export function calculateVoucherDiscount(
  subtotal: number,
  voucher: VoucherPricing
): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  if (voucher.minSubtotal !== undefined && subtotal < voucher.minSubtotal) return 0;

  const raw =
    voucher.type === 'PERCENT'
      ? subtotal * (Math.min(100, Math.max(0, voucher.value)) / 100)
      : voucher.value;

  const capped =
    voucher.maxDiscount !== undefined ? Math.min(raw, voucher.maxDiscount) : raw;

  return roundMoney(Math.min(Math.max(0, capped), subtotal));
}
