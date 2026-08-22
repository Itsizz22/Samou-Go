/**
 * Samou' Go — delivery fee. THE single source of truth.
 *
 * The API imports `calculateDeliveryFee` from here when creating an order, and
 * the front-ends mirror this file in `src/lib/delivery.ts` (see DESIGN_SYSTEM.md
 * §8). No screen and no controller may hardcode the string "رسوم التوصيل",
 * "Delivery Fee", "ILS" or "₪", and none may carry a fee as a pre-formatted
 * string like `'3 ILS'`.
 *
 * Business rule, Samou' / Hebron, as of 2026-08:
 *   Delivery fee is determined by the driver upon pickup, based on region
 *   and distance. The UI displays "يحددها السائق عند الاستلام" (Driver
 *   determines upon delivery). The tiered tariff below is kept in the types
 *   for possible future use, but `calculateDeliveryFee` always returns 0 today.
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

/** The delivery fee is always determined by the driver upon pickup. */
export const DRIVER_FEE_LABEL = {
  ar: 'يحددها السائق عند الاستلام',
  en: 'Set by driver upon delivery',
} as const;

/** Explanation notice shown below the delivery fee line. */
export const DRIVER_FEE_NOTICE = {
  ar: 'ملاحظة: رسوم التوصيل يحددها السائق عند الاستلام بناءً على المنطقة والمسافة.',
  en: 'Note: Delivery fee is determined by the driver upon delivery based on region and distance.',
} as const;

/**
 * The tariff shape. Stored per-store one day; for now a single platform-wide
 * default. `bulkThreshold` is inclusive of `bulkFee`. Kept so a future fee
 * re-launch only changes amounts, never the call sites.
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
  /** Additive regional tariff after the basket-size tier. */
  regionSurcharges?: Partial<Record<DeliveryRegion, number>>;
}

export const DELIVERY_REGIONS = ['central', 'outer', 'remote'] as const;
export type DeliveryRegion = (typeof DELIVERY_REGIONS)[number];

/**
 * The default tariff. Zeroed — delivery is free platform-wide as of 2026-08.
 * The interface keeps `baseFee` / `bulkFee` / `bulkThreshold` so a future
 * re-launch of the fee only touches this object, never the call sites.
 */
export const DEFAULT_DELIVERY_FEE_CONFIG: DeliveryFeeConfig = {
  baseFee: 0,
  bulkFee: 0,
  bulkThreshold: 5,
  currency: CURRENCY.code,
  regionSurcharges: { central: 0, outer: 0, remote: 0 },
};

/**
 * Fee for an order — flatly 0, because delivery is FREE on Samou'.
 * The `config`/`region` parameters are kept for signature compatibility with
 * the tariff plumbing (env config, `/api/v1/meta`, the front-end mirrors), but
 * the fee is never charged, regardless of what the config or environment says.
 */
export function calculateDeliveryFee(
  itemCount: number,
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_FEE_CONFIG,
  region: DeliveryRegion = 'central'
): number {
  return 0;
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

/** `"رسوم التوصيل / Delivery Fee: ₪0"` — label and amount in one string. */
export function formatDeliveryFee(
  amount: number,
  options: CurrencyOptions & { locale?: Locale | 'both'; short?: boolean } = {}
): string {
  const { locale = 'both', short = false, ...currency } = options;
  return `${deliveryFeeLabel(locale, short)}: ${formatCurrency(amount, currency)}`;
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
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_FEE_CONFIG,
  region: DeliveryRegion = 'central'
): OrderTotals {
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = roundMoney(
    lines.reduce((sum, line) => sum + lineTotal(line.unitPrice, line.quantity), 0)
  );
  const deliveryFee = calculateDeliveryFee(itemCount, config, region);

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
