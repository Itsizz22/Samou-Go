import { describe, expect, it } from 'vitest';
import { generateOrderNumber } from '../identifiers';
describe('customer-facing order numbers', () => {
  it('uses decimal digits with a growing sequence instead of wrapping', () => {
    const date = new Date(2026, 8, 10, 12);
    expect(generateOrderNumber(date, 1)).toBe('260910-001');
    expect(generateOrderNumber(date, 10)).toBe('260910-010');
    expect(generateOrderNumber(date, 1000)).toBe('260910-1000');
    expect(() => generateOrderNumber(date, -1)).toThrow();
  });
});
