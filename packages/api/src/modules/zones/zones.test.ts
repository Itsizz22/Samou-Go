import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), findUnique: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { deliveryZone: mocks } }));
vi.mock('./zones.mapper', () => ({ toDeliveryZone: (row: unknown) => row }));
import { createDeliveryZoneSchema, updateDeliveryZoneSchema } from './zones.schemas';
import { createZone, updateZone } from './zones.service';
describe('optional English delivery-zone name', () => {
  it.each([undefined, '', '   '])('creates an Arabic-only zone with English input %s', async nameEn => {
    mocks.create.mockResolvedValue({});
    await createZone(createDeliveryZoneSchema.parse({ nameAr: 'اصفي', nameEn, fee: 5 }));
    expect(mocks.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ nameAr: 'اصفي', nameEn: 'اصفي', deliveryFee: 5 }) });
  });
  it('uses the existing Arabic name when clearing English on update', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'zone', nameAr: 'اصفي' }); mocks.update.mockResolvedValue({});
    await updateZone('zone', updateDeliveryZoneSchema.parse({ nameEn: ' ' }));
    expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: 'zone' }, data: { nameEn: 'اصفي' } });
  });
  it('still rejects an empty Arabic name and invalid fees', () => {
    expect(createDeliveryZoneSchema.safeParse({ nameAr: '', fee: 5 }).success).toBe(false);
    expect(createDeliveryZoneSchema.safeParse({ nameAr: 'اصفي', fee: -1 }).success).toBe(false);
  });
});
