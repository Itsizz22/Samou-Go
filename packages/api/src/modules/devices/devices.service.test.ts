import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const tx = {
    deviceToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return { tx };
});

vi.mock('../../lib/prisma', () => ({
  prisma: {
    deviceToken: {
      findUnique: h.tx.deviceToken.findUnique,
      update: h.tx.deviceToken.update,
      create: h.tx.deviceToken.create,
      deleteMany: h.tx.deviceToken.deleteMany,
    },
  },
}));

import {
  registerDeviceToken,
  unregisterDeviceToken,
} from './devices.service';

type RegBody = Parameters<typeof registerDeviceToken>[1];

function token(kind: 'fresh' | 'existing-driver' | 'existing-other'): void {
  if (kind === 'fresh') h.tx.deviceToken.findUnique.mockResolvedValue(null);
  else
    h.tx.deviceToken.findUnique.mockResolvedValue(
      kind === 'existing-driver'
        ? { id: 'tt1', userId: 'driver-1' }
        : { id: 'tt1', userId: 'driver-2' }
    );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerDeviceToken — per-device upsert', () => {
  it('creates a brand-new token with device metadata', async () => {
    token('fresh');
    h.tx.deviceToken.create.mockResolvedValue({ id: 'tt-new' });

    const body: RegBody = { token: 'fcm-A', platform: 'android', deviceInfo: 'Samsung S24 · Android 14' };
    const result = await registerDeviceToken('driver-1', body);

    expect(result).toEqual({ id: 'tt-new', upserted: false });
    expect(h.tx.deviceToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'driver-1',
        token: 'fcm-A',
        platform: 'android',
        deviceInfo: 'Samsung S24 · Android 14',
      },
    });
    expect(h.tx.deviceToken.update).not.toHaveBeenCalled();
  });

  it('create is valid without deviceInfo (field omitted, not null)', async () => {
    token('fresh');
    h.tx.deviceToken.create.mockResolvedValue({ id: 'tt-new' });

    await registerDeviceToken('driver-1', { token: 'fcm-B', platform: 'ios' });

    const data = h.tx.deviceToken.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data.data).not.toHaveProperty('deviceInfo');
  });

  it('re-registering the same token for the SAME user refreshes metadata, never duplicates', async () => {
    token('existing-driver');
    h.tx.deviceToken.update.mockResolvedValue({});

    const result = await registerDeviceToken('driver-1', {
      token: 'fcm-A',
      platform: 'ios',
      deviceInfo: 'iPhone 15',
    });

    expect(result).toEqual({ id: 'tt1', upserted: true });
    expect(h.tx.deviceToken.update).toHaveBeenCalledWith({
      where: { id: 'tt1' },
      data: { platform: 'ios', deviceInfo: 'iPhone 15' },
    });
    expect(h.tx.deviceToken.create).not.toHaveBeenCalled();
  });

  it('re-registration without deviceInfo preserves the stored metadata (no overwrite with undefined)', async () => {
    token('existing-driver');

    await registerDeviceToken('driver-1', { token: 'fcm-A', platform: 'android' });

    const arg = h.tx.deviceToken.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data).toEqual({ platform: 'android' });
    expect(arg.data).not.toHaveProperty('deviceInfo');
  });

  it('reassigns a token leftover from ANOTHER user to the registering user', async () => {
    token('existing-other');
    h.tx.deviceToken.update.mockResolvedValue({});

    const result = await registerDeviceToken('driver-1', {
      token: 'fcm-stale',
      platform: 'web',
    });

    expect(result).toEqual({ id: 'tt1', upserted: true });
    expect(h.tx.deviceToken.update).toHaveBeenCalledWith({
      where: { id: 'tt1' },
      data: { userId: 'driver-1', platform: 'web' },
    });
  });

  it('never touches the tokens of the user’s OTHER devices on re-registration', async () => {
    token('existing-driver');

    await registerDeviceToken('driver-1', { token: 'fcm-A', platform: 'android' });

    expect(h.tx.deviceToken.findUnique).toHaveBeenCalledTimes(1);
    expect(h.tx.deviceToken.create).not.toHaveBeenCalled();
    // Only the one matched row is updated — no userId-scoped bulk writes.
    const calls = h.tx.deviceToken.update.mock.calls as Array<[{ where: Record<string, unknown> }]>;
    expect(calls).toHaveLength(1);
    expect(calls[0]![0].where).toEqual({ id: 'tt1' });
  });
});

describe('unregisterDeviceToken — selective per-device removal', () => {
  it('deletes ONLY the matching token for the given user', async () => {
    h.tx.deviceToken.deleteMany.mockResolvedValue({ count: 1 });

    await unregisterDeviceToken('driver-1', { token: 'fcm-A' });

    expect(h.tx.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'fcm-A', userId: 'driver-1' },
    });
  });

  it('is a no-op for a token owned by someone else', async () => {
    h.tx.deviceToken.deleteMany.mockResolvedValue({ count: 0 });

    await unregisterDeviceToken('driver-2', { token: 'fcm-A' });

    expect(h.tx.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'fcm-A', userId: 'driver-2' },
    });
  });
});