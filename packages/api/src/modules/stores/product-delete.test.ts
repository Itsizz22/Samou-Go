import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), deleteMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { product: mocks }, caseInsensitiveContains: vi.fn() }));
import { permanentlyDeleteProduct } from './stores.service';
beforeEach(() => { vi.clearAllMocks(); mocks.findUnique.mockResolvedValue({ storeId: 's' }); mocks.deleteMany.mockResolvedValue({ count: 1 }); });
describe('permanent catalogue deletion', () => {
  it('deletes only an owned product without order or offer references', async () => {
    await permanentlyDeleteProduct('s', 'p');
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: 'p', storeId: 's', orderItems: { none: {} }, offerProducts: { none: {} } } });
  });
  it('rejects products belonging to another store', async () => {
    await expect(permanentlyDeleteProduct('other', 'p')).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
  it('reports missing products without deleting', async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(permanentlyDeleteProduct('s', 'p')).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
  it('preserves products linked to orders or offers', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    await expect(permanentlyDeleteProduct('s', 'p')).rejects.toMatchObject({ statusCode: 409 });
  });
});
