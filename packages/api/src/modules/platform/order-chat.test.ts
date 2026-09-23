import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ order: vi.fn(), existing: vi.fn(), count: vi.fn(), create: vi.fn(), push: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { order: { findUnique: mocks.order }, chatMessage: { findUnique: mocks.existing, count: mocks.count, create: mocks.create } } }));
vi.mock('../../lib/push', () => ({ sendPushToUser: mocks.push }));
import { writeChat } from './order-chat';
const body = { recipientId: 'customer', clientMessageId: 'ad00a636-f52e-4312-b966-972cb15bc013', message: 'Hello' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.mockResolvedValue({ status: 'ACCEPTED', orderNumber: 'SQ-1', customerId: 'customer', captainId: 'captain', customer: { id: 'customer', name: 'Customer' }, captain: { id: 'captain', name: 'Captain' }, store: { managerId: 'store', nameAr: 'Store' } });
  mocks.existing.mockResolvedValue(null); mocks.count.mockResolvedValue(0);
  mocks.create.mockResolvedValue({ id: 'message' }); mocks.push.mockResolvedValue({ sent: 1, failed: 0 });
});
it.each([{ sub: 'store', role: 'STORE_MANAGER' as const }, { sub: 'captain', role: 'CAPTAIN' as const }])('notifies the customer of a message from $role', async auth => {
  await writeChat('order', auth, body);
  expect(mocks.push).toHaveBeenCalledWith('customer', expect.objectContaining({ data: expect.objectContaining({ type: 'CHAT_MESSAGE', orderId: 'order', senderId: auth.sub, messageId: 'message' }) }), { dataOnly: true });
});
it.each(['store', 'captain'])('notifies %s of a customer message', async recipientId => {
  await writeChat('order', { sub: 'customer', role: 'CUSTOMER' }, { ...body, recipientId });
  expect(mocks.push).toHaveBeenCalledWith(recipientId, expect.anything(), { dataOnly: true });
});
it('does not duplicate notifications on an idempotent retry', async () => {
  mocks.existing.mockResolvedValue({ ...body, orderId: 'order' });
  await writeChat('order', { sub: 'store', role: 'STORE_MANAGER' }, body);
  expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it('does not send to a user outside the order', async () => {
  await expect(writeChat('order', { sub: 'store', role: 'STORE_MANAGER' }, { ...body, recipientId: 'outsider' })).rejects.toMatchObject({ statusCode: 403 });
  expect(mocks.push).not.toHaveBeenCalled();
});
