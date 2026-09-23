import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  preferences: vi.fn().mockResolvedValue({ marketingNotificationsEnabled: true }),
  auditCreate: vi.fn().mockResolvedValue({ id: 'audit' }), auditUpdate: vi.fn().mockResolvedValue({}),
  send: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), initialize: vi.fn(), cert: vi.fn(() => ({})),
}));
vi.mock('../config/env', () => ({ env: { firebase: { serviceAccountJson: '{}', serviceAccountPath: null, projectId: 'test-only' } } }));
vi.mock('./prisma', () => ({ prisma: { user: { findUnique: mocks.preferences }, notificationDelivery: { create: mocks.auditCreate, update: mocks.auditUpdate }, deviceToken: { findMany: mocks.findMany, deleteMany: mocks.deleteMany } } }));
vi.mock('firebase-admin/app', () => ({ getApps: () => [], initializeApp: mocks.initialize, cert: mocks.cert }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ sendEachForMulticast: mocks.send }) }));
import { sendPushToUser } from './push';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([{ id: 'device', token: 'test-token', platform: 'android', refreshTokenId: 'session' }]);
  mocks.send.mockResolvedValue({ responses: [{ success: true }] });
});

describe('FCM delivery payload', () => {
  it('passes a single multicast message object with high-priority data for native closed-app handling', async () => {
    await expect(sendPushToUser('user', { title: 'Order', body: 'Ready', data: { type: 'NEW_ORDER', orderId: 'order' } }, { dataOnly: true })).resolves.toEqual({ sent: 1, failed: 0 });
    expect(mocks.cert).toHaveBeenCalledWith({});
    expect(mocks.initialize).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'test-only' }));
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      tokens: ['test-token'], data: { title: 'Order', body: 'Ready', type: 'NEW_ORDER', orderId: 'order', notificationLogId: 'audit' }, android: expect.objectContaining({ priority: 'high' }),
    }));
    expect(mocks.send.mock.calls[0]?.[0]).not.toHaveProperty('notification');
    expect(mocks.send.mock.calls[0]?.[0].android).not.toHaveProperty('notification');
  });
  it('includes the system notification payload for customer background alerts', async () => {
    await sendPushToUser('user', { title: 'Delivered', body: 'Complete' });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ notification: { title: 'Delivered', body: 'Complete' } }));
  });
  it('removes only stale device tokens after a failed delivery', async () => {
    mocks.send.mockResolvedValue({ responses: [{ success: false, error: { code: 'messaging/registration-token-not-registered' } }] });
    await expect(sendPushToUser('user', { title: 'Order', body: 'Ready' })).resolves.toEqual({ sent: 0, failed: 1 });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user', OR: [{ id: 'device', token: 'test-token', refreshTokenId: 'session' }] } });
  });
});

it('keeps staff alerts visible on iOS while Android remains data-only', async () => {
  await sendPushToUser('user', { title: 'طلب جديد للمتجر', body: 'رقم الطلب: SQ-10', data: { type: 'NEW_ORDER_ALERT', orderId: 'order' } }, { dataOnly: true });
  const message = mocks.send.mock.calls[0]?.[0];
  expect(message).not.toHaveProperty('notification');
  expect(message.android).not.toHaveProperty('notification');
  expect(message.apns.headers).toEqual({ 'apns-push-type': 'alert', 'apns-priority': '10' });
  expect(message.apns.payload.aps).toMatchObject({ alert: { title: 'طلب جديد للمتجر', body: 'رقم الطلب: SQ-10' }, sound: 'order_alarm.wav', category: 'SAMOU_NEW_ORDER' });
});

it('records provider acceptance without claiming the device opened the notification', async () => {
  await sendPushToUser('user', { title: 'اختبار', body: 'body' });
  expect(mocks.auditUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED', sentCount: 1 }) }));
  expect(mocks.auditUpdate.mock.calls[0]?.[0].data).not.toHaveProperty('openedAt');
});
it('records a provider exception with a code, never the token-bearing error message', async () => {
  mocks.send.mockRejectedValue(Object.assign(new Error('secret token must not be logged'), { code: 'messaging/server-unavailable' }));
  await expect(sendPushToUser('user', { title: 'اختبار', body: 'body' })).rejects.toThrow();
  expect(mocks.auditUpdate).toHaveBeenCalledWith({ where: { id: 'audit' }, data: { status: 'FAILED', errorCode: 'messaging/server-unavailable', failedCount: 1 } });
});

it('does not duplicate a successful push when audit persistence is unavailable', async () => {
  mocks.auditUpdate.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(sendPushToUser('user', { title: 'Order', body: 'Ready' })).resolves.toEqual({ sent: 1, failed: 0 });
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it('allows order alerts while promotional notifications are disabled', async () => {
  mocks.preferences.mockResolvedValue({ marketingNotificationsEnabled:false });
  await sendPushToUser('user',{ title:'عرض',body:'خصم',data:{type:'PROMOTION'} });
  expect(mocks.send).not.toHaveBeenCalled();
  await sendPushToUser('user',{title:'طلب',body:'جاهز',data:{type:'NEW_ORDER'} });
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it('selects only registrations owned by a live, unexpired recipient session', async () => {
  await sendPushToUser('recipient', { title: 'Order', body: 'Ready' });
  expect(mocks.findMany).toHaveBeenCalledWith({ where: { userId: 'recipient', refreshSession: { is: { userId: 'recipient', revokedAt: null, pushEnabled: true, expiresAt: { gt: expect.any(Date) } } } }, select: { id: true, token: true, platform: true, refreshTokenId: true } });
});

it('records per-device APNs authentication failures and preserves valid tokens', async () => {
  mocks.findMany.mockResolvedValue([{ id: 'ios-device', token: 'private-token', platform: 'ios', refreshTokenId: 'session' }]);
  mocks.send.mockResolvedValue({ responses: [{ success: false, error: { code: 'messaging/third-party-auth-error' } }] });
  await expect(sendPushToUser('user', { title: 'Order', body: 'Ready' }, { dataOnly: true })).resolves.toEqual({ sent: 0, failed: 1 });
  expect(mocks.auditUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', errorCode: 'messaging/third-party-auth-error' }) }));
  expect(mocks.deleteMany).not.toHaveBeenCalled();
});


it.each(['NEW_ORDER', 'NEW_ORDER_ALERT', 'CAPTAIN_ASSIGN'])('uses the bundled normal ringtone for %s', async type => {
  await sendPushToUser('staff', { title: 'Order', body: 'Incoming', data: { type } }, { dataOnly: true });
  expect(mocks.send.mock.calls[0]?.[0].apns.payload.aps.sound).toBe('order_alarm.wav');
});
it('keeps ordinary customer updates on the default sound', async () => {
  await sendPushToUser('customer', { title: 'Order', body: 'Delivered', data: { type: 'ORDER_STATUS' } });
  expect(mocks.send.mock.calls[0]?.[0].apns.payload.aps.sound).toBe('default');
});

it.each(['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED'])('sends an audible visible iOS alert and Android notification for %s', async status => {
  mocks.findMany.mockResolvedValue([
    { id: 'ios', token: 'ios-token', platform: 'ios', refreshTokenId: 'ios-session' },
    { id: 'android', token: 'android-token', platform: 'android', refreshTokenId: 'android-session' },
  ]);
  mocks.send.mockResolvedValue({ responses: [{ success: true }, { success: true }] });
  await expect(sendPushToUser('customer', { title: 'Order update', body: status, data: { type: 'ORDER_STATUS', status, orderId: 'order' } })).resolves.toEqual({ sent: 2, failed: 0 });
  const message = mocks.send.mock.calls[0]?.[0];
  expect(message.apns.headers).toMatchObject({ 'apns-push-type': 'alert', 'apns-priority': '10' });
  expect(message.apns.payload.aps).toMatchObject({ alert: { title: 'Order update', body: status }, sound: 'default' });
  expect(message.notification).toBeDefined(); expect(message.android.priority).toBe('high');
});
it('chat remains an audible APNs alert while Android renders its own conversation notification', async () => {
  await sendPushToUser('recipient', { title: 'Chat', body: 'New message', data: { type: 'CHAT_MESSAGE', senderId: 'sender', orderId: 'order' } }, { dataOnly: true });
  const message = mocks.send.mock.calls[0]?.[0];
  expect(message.apns.payload.aps).toMatchObject({ sound: 'default', alert: { title: 'Chat', body: 'New message' } });
  expect(message).not.toHaveProperty('notification');
  expect(message.data).toMatchObject({ type: 'CHAT_MESSAGE', senderId: 'sender', orderId: 'order' });
});
