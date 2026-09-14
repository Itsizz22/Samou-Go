import { describe, expect, it } from 'vitest';
import type { Product, CategoryWithProducts } from '@samou-go/shared-types';
import { mealComplements } from './mealComplements';

const product = (id: string, nameAr: string, storeId = 'a', isAvailable = true): Product => ({
  id, nameAr, storeId, isAvailable, price: 5, description: null, imageUrl: null, categoryId: null,
});
const category = (nameAr: string, products: Product[]): CategoryWithProducts => ({
  id: nameAr, nameAr, nameEn: '', storeId: 'a', imageUrl: null, sortOrder: 0, products,
});
const store = { id: 'a', categories: [
  category('وجبات', [product('meal', 'وجبة برجر')]),
  category('المشروبات', [product('cola', 'كولا'), product('other', 'عصير', 'b'), product('sold', 'ماء', 'a', false)]),
] };
describe('cart drinks from the same store', () => {
  it('excludes other stores and unavailable drinks', () => {
    expect(mealComplements(store, new Set(['meal'])).map(p => p.id)).toEqual(['cola']);
  });
  it('does not suggest a drink already in the basket', () => {
    expect(mealComplements(store, new Set(['meal', 'cola']))).toEqual([]);
  });
  it('hides suggestions for a drinks-only or empty basket', () => {
    expect(mealComplements(store, new Set(['cola']))).toEqual([]);
    expect(mealComplements(store, new Set())).toEqual([]);
  });
  it('hides suggestions when the store has no drinks', () => {
    expect(mealComplements({ id: 'a', categories: [category('وجبات', [product('meal', 'وجبة')])] }, new Set(['meal']))).toEqual([]);
  });
});
