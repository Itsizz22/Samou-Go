import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/env', () => ({
  env: {
    firebase: { serviceAccountPath: null, serviceAccountJson: null, projectId: null },
  },
}));
vi.mock('./prisma', () => ({ prisma: {} }));

import { isStaleTokenCode } from './push';

describe('isStaleTokenCode — dead-device classification', () => {
  it('treats every shape of "token gone" error as stale', () => {
    expect(isStaleTokenCode('messaging/registration-token-not-registered')).toBe(true);
    expect(isStaleTokenCode('messaging/unregistered')).toBe(true);
    expect(isStaleTokenCode('UNREGISTERED')).toBe(true);
    expect(isStaleTokenCode('messaging/invalid-registration-token')).toBe(true);
  });

  it('keeps transient/other errors — the device should not be dropped', () => {
    expect(isStaleTokenCode('messaging/authentication-error')).toBe(false);
    expect(isStaleTokenCode('messaging/device-message-rate-exceeded')).toBe(false);
    expect(isStaleTokenCode('messaging/server-unavailable')).toBe(false);
    expect(isStaleTokenCode('messaging/internal-error')).toBe(false);
  });

  it('is safe with missing/empty codes', () => {
    expect(isStaleTokenCode(undefined)).toBe(false);
    expect(isStaleTokenCode(null)).toBe(false);
    expect(isStaleTokenCode('')).toBe(false);
  });
});