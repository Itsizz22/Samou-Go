import { beforeEach, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
const mocks = vi.hoisted(() => ({ assign: vi.fn(), push: vi.fn(), event: vi.fn() }));
vi.mock('./orders.service', () => ({ assignCaptain: mocks.assign }));
vi.mock('../../lib/push', () => ({ sendPushToUser: mocks.push, sendPushToMany: vi.fn() }));
vi.mock('../../realtime', () => ({ emitPlatformEvent: mocks.event, emitOrderStatus: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: {} }));
vi.mock('../../middleware/authenticate', () => ({ requireAuth: () => ({ sub: 'manager', role: 'STORE_MANAGER' }) }));
import { assignCaptainHandler } from './orders.controller';
beforeEach(() => { vi.clearAllMocks(); mocks.push.mockResolvedValue({ sent: 1, failed: 0 }); });
it('assignment sends a native captain alarm containing the assigned order and no mixed notification payload', async () => {
  mocks.assign.mockResolvedValue({ id: 'order-qa', orderNumber: 'SQ-QA', captainId: 'captain-qa', storeId: 'store-qa' });
  const req = { params: { orderId: 'order-qa' }, body: { captainId: 'captain-qa' } } as unknown as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  await assignCaptainHandler(req, res);
  expect(mocks.push).toHaveBeenCalledWith('captain-qa', expect.objectContaining({
    data: { orderId: 'order-qa', type: 'CAPTAIN_ASSIGN', storeId: 'store-qa', screen: 'order' },
  }), { dataOnly: true });
});
