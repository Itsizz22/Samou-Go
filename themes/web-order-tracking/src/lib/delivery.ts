/**
 * Samou' Go — delivery fee.
 *
 * Every delivery-fee label and amount in the app MUST come from this module.
 * No screen may hardcode the string "رسوم التوصيل", "Delivery Fee", "ILS", "₪",
 * and no screen may carry a fee as a pre-formatted string like `'3 ILS'`.
 *
 * ⚠️  MIRROR — the canonical source is `packages/shared-types/src/delivery.ts`,
 *     which the API imports. This file exists only because the Vite apps are not
 *     yet wired to the workspace package. Keep the arithmetic byte-for-byte
 *     identical: if the tariff changes, change shared-types first, then mirror.
 *
 * See /DESIGN_SYSTEM.md §8
 */

export type Locale = 'ar' | 'en';

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

export const CURRENCY = {
  code: 'ILS',
  symbol: '₪',
} as const;

/** The tariff: a flat fee per order, stepped once the basket gets bulky. */
export interface DeliveryFeeConfig {
  /** Fee for a basket below `bulkThreshold` items, in ILS. */
  baseFee: number;
  /** Fee for a basket of `bulkThreshold` items or more, in ILS. */
  bulkFee: number;
  /** Item count at which the bulk fee kicks in (inclusive). */
  bulkThreshold: number;
  currency: typeof CURRENCY.code;
}

/**
 * Samou' pricing: 3 ₪ for a small basket, 5 ₪ from 5 items up.
 * The API can override the amounts from the environment, but not the rule.
 */
export const DEFAULT_DELIVERY_FEE_CONFIG: DeliveryFeeConfig = {
  baseFee: 3,
  bulkFee: 5,
  bulkThreshold: 5,
  currency: CURRENCY.code,
};

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

/** Formats a bare amount. Never call `.toFixed()` on money in a component. */
export function formatCurrency(amount: number, options: CurrencyOptions = {}): string {
  const { unit = 'symbol', decimals } = options;
  const places = decimals ?? (Number.isInteger(amount) ? 0 : 2);
  const value = amount.toFixed(places);

  if (unit === 'symbol') return `${CURRENCY.symbol}${value}`;
  if (unit === 'code') return `${value} ${CURRENCY.code}`;
  return value;
}

/**
 * Fee for an order, derived from item count — the rule the checkout screen uses.
 * Counts UNITS, not distinct products: 5× bread is a bulky basket.
 * An empty basket is free, because there is nothing to carry.
 */
export function calculateDeliveryFee(
  itemCount: number,
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_FEE_CONFIG
): number {
  if (!Number.isFinite(itemCount) || itemCount <= 0) return 0;
  return itemCount >= config.bulkThreshold ? config.bulkFee : config.baseFee;
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

export const FREE_DELIVERY_LABEL = {
  ar: 'توصيل مجاني',
  en: 'Free delivery',
} as const;
