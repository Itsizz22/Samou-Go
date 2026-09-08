import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@samou-go/shared-types';
import * as controller from './options.controller';
import * as service from './options.service';

vi.mock('./options.service', () => ({
  listOptionGroups: vi.fn().mockResolvedValue([]),
  createOptionGroup: vi.fn().mockResolvedValue({ id: 'group-1' }),
  updateOptionGroup: vi.fn().mockResolvedValue({ id: 'group-1' }),
  deleteOptionGroup: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => vi.clearAllMocks());

describe('option management authenticated actor', () => {
  const cases = [
    [controller.listOptionGroupsHandler, service.listOptionGroups],
    [controller.createOptionGroupHandler, service.createOptionGroup],
    [controller.updateOptionGroupHandler, service.updateOptionGroup],
    [controller.deleteOptionGroupHandler, service.deleteOptionGroup],
  ] as const;

  for (const [handler, serviceFn] of cases) {
    it(`${handler.name} uses the JWT subject from req.auth`, async () => {
      const auth = { sub: 'manager-1', role: UserRole.STORE_MANAGER };
      const req = {
        auth,
        params: { storeId: 'store-1', productId: 'product-1', groupId: 'group-1' },
        body: { name: 'Sauce' },
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn(),
      } as unknown as Response;

      await handler(req, res);
      expect(vi.mocked(serviceFn).mock.calls[0]?.[0]).toEqual(auth);
      if (handler !== controller.deleteOptionGroupHandler) {
        expect(res.json).toHaveBeenCalledWith({ success: true, data: handler === controller.listOptionGroupsHandler ? { items: [] } : { id: 'group-1' } });
      }
    });

    it(`${handler.name} rejects a missing authenticated actor`, async () => {
      await expect(handler({} as Request, {} as Response)).rejects.toMatchObject({ statusCode: 401 });
      expect(serviceFn).not.toHaveBeenCalled();
    });
  }
});
