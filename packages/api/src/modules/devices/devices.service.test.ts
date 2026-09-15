import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { deviceToken: db } }));
import { registerDeviceToken, unregisterDeviceToken } from './devices.service';
beforeEach(() => {
  vi.clearAllMocks();
  db.findUnique.mockResolvedValue(null);
  db.upsert.mockResolvedValue({ id: 'device' });
});
describe('device registration concurrency and ownership', () => {
  it('uses the token unique key for simultaneous first registrations', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => registerDeviceToken('user-a', { token: 'device-token', platform: 'android' })));
    expect(results.every(result => result.id === 'device')).toBe(true);
    expect(db.upsert).toHaveBeenCalledTimes(10);
    expect(db.upsert).toHaveBeenCalledWith({
      where: { token: 'device-token' },
      create: { userId: 'user-a', token: 'device-token', platform: 'android' },
      update: { userId: 'user-a', platform: 'android' }, select: { id: true },
    });
    // This verifies the atomic query contract; real PostgreSQL races are a separate acceptance gate.
  });
  it('reassigns only the matching device and preserves omitted metadata', async () => {
    db.findUnique.mockResolvedValue({ id: 'device', userId: 'old-account' });
    await expect(registerDeviceToken('new-account', { token: 'device-token', platform: 'ios' })).resolves.toEqual({ id: 'device', upserted: true });
    expect(db.upsert.mock.calls[0]?.[0].update).toEqual({ userId: 'new-account', platform: 'ios' });
    expect(db.deleteMany).not.toHaveBeenCalled();
  });
  it('refreshes supplied metadata on both branches', async () => {
    await registerDeviceToken('user-a', { token: 'token', platform: 'web', deviceInfo: 'Safari' });
    const query = db.upsert.mock.calls[0]?.[0];
    expect(query.create.deviceInfo).toBe('Safari');
    expect(query.update.deviceInfo).toBe('Safari');
  });
  it('logout cannot remove another account device or other devices', async () => {
    await unregisterDeviceToken('user-a', { token: 'device-token' });
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { token: 'device-token', userId: 'user-a' } });
  });
});
