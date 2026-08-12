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

/** The tariff shape, kept so call sites outlive the free-delivery promo. */
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
 * The default tariff. Zeroed — delivery is free platform-wide as of 2026-08,
 * so total = subtotal on every basket.
 */
export const DEFAULT_DELIVERY_FEE_CONFIG: DeliveryFeeConfig = {
  baseFee: 0,
  bulkFee: 0,
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
 * Fee for an order — flatly 0, because delivery is FREE on Samou' as of 2026-08.
 * The `config` parameter stays for signature compatibility with the server's
 * `/api/v1/meta` tariff, but no basket is ever charged a fee.
 */
export function calculateDeliveryFee(
  itemCount: number,
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_FEE_CONFIG
): number {
  // Delivery is free — nothing to charge, whatever the item count.
  return 0;
}

/** `"رسوم التوصيل / Delivery Fee: ₪0"` — label and amount in one string. */
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
