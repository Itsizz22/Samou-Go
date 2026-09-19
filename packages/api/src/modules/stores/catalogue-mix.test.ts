import { describe, expect, it } from 'vitest';
import { mixCatalogue } from './catalogue-mix';

const products = ['boss', 'yafa', 'khayal'].flatMap(storeId => Array.from({ length: 9 }, (_, index) => ({ id: `${storeId}-${index}`, storeId })));
describe('mixed catalogue', () => {
  it('interleaves stores, preserves every product, and is independent of database row order', () => {
    const mixed = mixCatalogue(products, 'session-a');
    expect(mixed).toHaveLength(products.length);
    expect(new Set(mixed.map(item => item.id)).size).toBe(products.length);
    expect(mixed).toEqual(mixCatalogue([...products].reverse(), 'session-a'));
    for (let index = 0; index < mixed.length; index += 3) expect(new Set(mixed.slice(index, index + 3).map(item => item.storeId)).size).toBe(3);
  });
  it('changes the selection with the seed and enforces the per-store cap', () => {
    const mixed = mixCatalogue(products, 'session-a', 2);
    expect(mixed).toHaveLength(6);
    expect(mixed).not.toEqual(mixCatalogue(products, 'session-b', 2));
    for (const store of ['boss', 'yafa', 'khayal']) expect(mixed.filter(item => item.storeId === store)).toHaveLength(2);
  });
  it('has no overlap across pages and drains uneven stores without losing items', () => {
    const items = products.filter(item => item.storeId !== 'boss' || item.id === 'boss-0');
    const mixed = mixCatalogue(items, 'stable');
    const first = mixed.slice(0, 12);
    const second = mixCatalogue(items, 'stable').slice(12, 24);
    expect(new Set([...first, ...second].map(item => item.id)).size).toBe(items.length);
    expect(mixCatalogue([], 'stable')).toEqual([]);
  });
});
