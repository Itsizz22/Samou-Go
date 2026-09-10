import { describe, it, expect } from 'vitest';
import { validateProductDiscount } from './product-discount';
import { createProductSchema, updateProductSchema } from './stores.schemas';
describe('product discounts', () => {
  it('accepts discount and removal', () => {
    expect(() => validateProductDiscount(20, 25)).not.toThrow();
    expect(() => validateProductDiscount(25, null)).not.toThrow();
  });
  it.each([20, 15, 0, -1, NaN])('rejects original price %s below the charged amount', original => {
    expect(() => validateProductDiscount(20, original)).toThrow();
  });
  it('preserves discounted price and original price through validation', () => {
    expect(createProductSchema.parse({ nameAr: 'Meal', price: 20, originalPrice: 25 })).toMatchObject({ price: 20, originalPrice: 25 });
    expect(updateProductSchema.parse({ price: 25, originalPrice: null })).toMatchObject({ price: 25, originalPrice: null });
    expect(createProductSchema.safeParse({ nameAr: 'Meal', price: 20, originalPrice: -5 }).success).toBe(false);
  });
});
