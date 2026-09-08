import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateOptionGroup } from './options.service';

const h = vi.hoisted(() => {
  const saved = {
    id: 'group-1', productId: 'product-1', name: 'Updated sauce',
    required: false, minSelect: 0, maxSelect: 1, sortOrder: 0,
    items: [{ id: 'item-2', name: 'Garlic', price: 2, sortOrder: 0, isActive: true }],
  };
  const tx = {
    productOptionItem: { deleteMany: vi.fn() },
    productOptionGroup: {
      update: vi.fn().mockResolvedValue(saved),
      findUnique: vi.fn().mockResolvedValue(saved),
    },
  };
  return {
    saved, tx,
    findUnique: vi.fn().mockResolvedValue({
      ...saved, name: 'Old sauce', items: [], product: { storeId: 'store-1', id: 'product-1' },
    }),
  };
});

vi.mock('../../lib/prisma', () => ({
  prisma: {
    productOptionGroup: { findUnique: h.findUnique, findMany: vi.fn().mockResolvedValue([]) },
    $transaction: (callback: (tx: typeof h.tx) => Promise<unknown>) => callback(h.tx),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('option group update response', () => {
  it.each([undefined, [{ name: 'Garlic', price: 2 }]])('returns the transaction view for items %j', async items => {
    const result = await updateOptionGroup(
      { sub: 'admin-1', role: 'ADMIN' }, 'store-1', 'group-1',
      { name: 'Updated sauce', ...(items ? { items } : {}) },
    );
    expect(result.name).toBe('Updated sauce');
    expect(result.items[0]).toMatchObject({ id: 'item-2', priceDelta: 2 });
    expect(h.tx.productOptionGroup.findUnique).toHaveBeenCalledOnce();
    expect(h.findUnique).toHaveBeenCalledOnce();
  });
});
