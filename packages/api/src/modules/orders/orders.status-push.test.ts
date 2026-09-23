import { beforeEach, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
const mocks = vi.hoisted(() => ({ update: vi.fn(), push: vi.fn(), many: vi.fn() }));
vi.mock('./orders.service', () => ({ updateOrderStatus: mocks.update }));
vi.mock('../../lib/push', () => ({ sendPushToUser: mocks.push, sendPushToMany: mocks.many }));
vi.mock('../../realtime', () => ({ emitPlatformEvent: vi.fn(), emitOrderStatus: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: {} }));
vi.mock('../../middleware/authenticate', () => ({ requireAuth: () => ({ sub: 'staff', role: 'CAPTAIN' }) }));
import { claimOrderHandler, updateOrderStatusHandler } from './orders.controller';

const order = { id: 'order-qa', customerId: 'customer-qa', orderNumber: 'SQ-10', captainId: 'captain-qa', storeId: 'store-qa', store: { nameAr: 'المتجر' }, fulfillmentType: 'DELIVERY' };
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() }) as unknown as Response;
beforeEach(() => { vi.clearAllMocks(); mocks.push.mockResolvedValue({ sent: 1, failed: 0 }); mocks.many.mockResolvedValue({ totalSent: 1 }); });

it.each(['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED'])('notifies the customer exactly once for %s with the order route and status', async status => {
  mocks.update.mockResolvedValue({ ...order, status });
  await updateOrderStatusHandler({ params: { orderId: order.id }, body: { status } } as unknown as Request, response());
  await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith(order.customerId, expect.objectContaining({ data: { orderId: order.id, type: 'ORDER_STATUS', status, screen: 'tracking' } })));
  expect(mocks.push.mock.calls.filter(call => call[0] === order.customerId)).toHaveLength(1);
});

it('the claim endpoint also notifies the customer when the captain picks up the order', async () => {
  mocks.update.mockResolvedValue({ ...order, status: 'ON_THE_WAY' });
  await claimOrderHandler({ params: { orderId: order.id }, body: {} } as unknown as Request, response());
  expect(mocks.push).toHaveBeenCalledWith(order.customerId, expect.objectContaining({ data: expect.objectContaining({ status: 'ON_THE_WAY', orderId: order.id }) }));
});

it('does not notify for a rejected or duplicate transition', async () => {
  mocks.update.mockRejectedValue(new Error('Order already in this state'));
  await expect(updateOrderStatusHandler({ params: { orderId: order.id }, body: { status: 'ACCEPTED' } } as unknown as Request, response())).rejects.toThrow();
  expect(mocks.push).not.toHaveBeenCalled();
});

it('pickup readiness tells the customer to collect from the store', async () => {
  mocks.update.mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP', fulfillmentType: 'PICKUP' });
  await updateOrderStatusHandler({ params: { orderId: order.id }, body: { status: 'READY_FOR_PICKUP' } } as unknown as Request, response());
  expect(mocks.push).toHaveBeenCalledWith(order.customerId, expect.objectContaining({ body: expect.stringContaining('جاهز لاستلامه من المتجر') }));
  expect(mocks.many).not.toHaveBeenCalled();
});
