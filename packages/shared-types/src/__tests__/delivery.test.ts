import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DELIVERY_FEE_CONFIG,
  calculateDeliveryFee,
  calculateOrderTotals,
  formatCurrency,
  formatDeliveryFee,
  isFreeDelivery,
  lineTotal,
  roundMoney,
  type DeliveryFeeConfig,
} from '../delivery';

/* ---------------------------------------------------------------------------
 * calculateDeliveryFee
 * ------------------------------------------------------------------------- */

describe('calculateDeliveryFee', () => {
  it('returns 0 for an empty basket (0 items)', () => {
    expect(calculateDeliveryFee(0)).toBe(0);
  });

  it('returns 0 for negative item counts', () => {
    expect(calculateDeliveryFee(-1)).toBe(0);
    expect(calculateDeliveryFee(-99)).toBe(0);
  });

  it('returns 0 for non-finite values', () => {
    expect(calculateDeliveryFee(NaN)).toBe(0);
    expect(calculateDeliveryFee(Infinity)).toBe(0);
  });

  it('returns baseFee (3 ₪) for 1 item', () => {
    expect(calculateDeliveryFee(1)).toBe(3);
  });

  it('returns baseFee (3 ₪) for 4 items — just under the threshold', () => {
    expect(calculateDeliveryFee(4)).toBe(3);
  });

  it('returns bulkFee (5 ₪) for exactly 5 items — the threshold', () => {
    expect(calculateDeliveryFee(5)).toBe(5);
  });

  it('returns bulkFee (5 ₪) for 10 items', () => {
    expect(calculateDeliveryFee(10)).toBe(5);
  });

  it('returns bulkFee (5 ₪) for 99 items', () => {
    expect(calculateDeliveryFee(99)).toBe(5);
  });

  it('respects a custom DeliveryFeeConfig', () => {
    const custom: DeliveryFeeConfig = {
      baseFee: 2,
      bulkFee: 8,
      bulkThreshold: 3,
      currency: 'ILS',
    };
    expect(calculateDeliveryFee(1, custom)).toBe(2);
    expect(calculateDeliveryFee(2, custom)).toBe(2);
    expect(calculateDeliveryFee(3, custom)).toBe(8);
    expect(calculateDeliveryFee(10, custom)).toBe(8);
  });

  it('uses DEFAULT_DELIVERY_FEE_CONFIG when no config is provided', () => {
    const { baseFee, bulkFee, bulkThreshold } = DEFAULT_DELIVERY_FEE_CONFIG;
    expect(calculateDeliveryFee(bulkThreshold - 1)).toBe(baseFee);
    expect(calculateDeliveryFee(bulkThreshold)).toBe(bulkFee);
  });
});

/* ---------------------------------------------------------------------------
 * roundMoney
 * ------------------------------------------------------------------------- */

describe('roundMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(1.004)).toBe(1.00);
  });

  it('fixes 0.1 + 0.2 float drift', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('returns whole numbers unchanged', () => {
    expect(roundMoney(5)).toBe(5);
    expect(roundMoney(0)).toBe(0);
  });

  it('handles negative amounts', () => {
    expect(roundMoney(-1.005)).toBe(-1.0);
  });
});

/* ---------------------------------------------------------------------------
 * lineTotal
 * ------------------------------------------------------------------------- */

describe('lineTotal', () => {
  it('multiplies unitPrice by quantity', () => {
    expect(lineTotal(15, 2)).toBe(30);
    expect(lineTotal(7.50, 3)).toBe(22.5);
  });

  it('rounds the result to 2 decimal places', () => {
    // 3.33 * 3 = 9.99 exactly — no drift
    expect(lineTotal(3.33, 3)).toBe(9.99);
  });

  it('returns 0 for zero quantity', () => {
    expect(lineTotal(10, 0)).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
 * calculateOrderTotals
 * ------------------------------------------------------------------------- */

describe('calculateOrderTotals', () => {
  it('handles an empty line list', () => {
    const totals = calculateOrderTotals([]);
    expect(totals.itemCount).toBe(0);
    expect(totals.subtotal).toBe(0);
    expect(totals.deliveryFee).toBe(0);
    expect(totals.totalAmount).toBe(0);
  });

  it('sums quantities for itemCount', () => {
    const totals = calculateOrderTotals([
      { unitPrice: 10, quantity: 2 },
      { unitPrice: 5, quantity: 3 },
    ]);
    expect(totals.itemCount).toBe(5);
  });

  it('applies baseFee (3 ₪) when itemCount < 5', () => {
    const totals = calculateOrderTotals([{ unitPrice: 10, quantity: 4 }]);
    expect(totals.deliveryFee).toBe(3);
    expect(totals.totalAmount).toBe(43);
  });

  it('applies bulkFee (5 ₪) when itemCount >= 5', () => {
    const totals = calculateOrderTotals([{ unitPrice: 15, quantity: 5 }]);
    expect(totals.deliveryFee).toBe(5);
    expect(totals.subtotal).toBe(75);
    expect(totals.totalAmount).toBe(80);
  });

  it('totalAmount = subtotal + deliveryFee', () => {
    const lines = [
      { unitPrice: 12, quantity: 1 },
      { unitPrice: 8, quantity: 2 },
    ];
    const totals = calculateOrderTotals(lines);
    expect(totals.totalAmount).toBe(totals.subtotal + totals.deliveryFee);
  });

  it('avoids float drift across multiple lines', () => {
    const lines = [
      { unitPrice: 0.1, quantity: 1 },
      { unitPrice: 0.2, quantity: 1 },
    ];
    const totals = calculateOrderTotals(lines);
    expect(totals.subtotal).toBe(0.3);
  });

  it('respects a custom DeliveryFeeConfig', () => {
    const config: DeliveryFeeConfig = { baseFee: 1, bulkFee: 2, bulkThreshold: 2, currency: 'ILS' };
    const totals = calculateOrderTotals([{ unitPrice: 10, quantity: 2 }], config);
    expect(totals.deliveryFee).toBe(2);
  });
});

/* ---------------------------------------------------------------------------
 * formatCurrency
 * ------------------------------------------------------------------------- */

describe('formatCurrency', () => {
  it('prefixes the ₪ symbol by default', () => {
    expect(formatCurrency(12)).toBe('₪12');
    expect(formatCurrency(12.5)).toBe('₪12.50');
  });

  it('omits decimal places for whole numbers', () => {
    expect(formatCurrency(3)).toBe('₪3');
    expect(formatCurrency(0)).toBe('₪0');
  });

  it('always shows 2 decimal places for non-integers', () => {
    expect(formatCurrency(3.5)).toBe('₪3.50');
    expect(formatCurrency(3.05)).toBe('₪3.05');
  });

  it('respects explicit decimal override', () => {
    expect(formatCurrency(12, { decimals: 2 })).toBe('₪12.00');
    expect(formatCurrency(12.5, { decimals: 0 })).toBe('₪13');
  });

  it('unit: code appends ILS after the amount', () => {
    expect(formatCurrency(12, { unit: 'code' })).toBe('12 ILS');
    expect(formatCurrency(3.5, { unit: 'code' })).toBe('3.50 ILS');
  });

  it('unit: none returns only the numeric string', () => {
    expect(formatCurrency(12, { unit: 'none' })).toBe('12');
    expect(formatCurrency(3.5, { unit: 'none' })).toBe('3.50');
  });
});

/* ---------------------------------------------------------------------------
 * formatDeliveryFee
 * ------------------------------------------------------------------------- */

describe('formatDeliveryFee', () => {
  it('builds a bilingual label with the amount', () => {
    const result = formatDeliveryFee(3);
    expect(result).toContain('رسوم التوصيل');
    expect(result).toContain('Delivery Fee');
    expect(result).toContain('₪3');
  });

  it('uses Arabic only with locale: ar', () => {
    const result = formatDeliveryFee(3, { locale: 'ar' });
    expect(result).toContain('رسوم التوصيل');
    expect(result).not.toContain('Delivery Fee');
  });

  it('uses English only with locale: en', () => {
    const result = formatDeliveryFee(3, { locale: 'en' });
    expect(result).toContain('Delivery Fee');
    expect(result).not.toContain('رسوم التوصيل');
  });
});

/* ---------------------------------------------------------------------------
 * isFreeDelivery
 * ------------------------------------------------------------------------- */

describe('isFreeDelivery', () => {
  it('returns true for 0', () => {
    expect(isFreeDelivery(0)).toBe(true);
  });

  it('returns true for negative amounts', () => {
    expect(isFreeDelivery(-1)).toBe(true);
  });

  it('returns false for positive amounts', () => {
    expect(isFreeDelivery(3)).toBe(false);
    expect(isFreeDelivery(0.01)).toBe(false);
  });
});
