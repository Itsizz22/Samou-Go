import { describe, expect, it } from 'vitest';
import { UserRole } from '../enums';
import { APP_KEYS, primaryAppForRole } from '../roles';

describe('primaryAppForRole', () => {
  it('maps every role to its home app', () => {
    expect(primaryAppForRole(UserRole.CUSTOMER)).toBe('customer');
    expect(primaryAppForRole(UserRole.STORE_MANAGER)).toBe('store-manager');
    expect(primaryAppForRole(UserRole.CAPTAIN)).toBe('captain');
    expect(primaryAppForRole(UserRole.ADMIN)).toBe('admin');
  });

  it('covers every role exactly once', () => {
    const mapped = Object.values(UserRole).map((role) => primaryAppForRole(role));
    expect(new Set(mapped).size).toBe(Object.values(UserRole).length);
  });
});

describe('APP_KEYS', () => {
  it('matches the seven deployed themes', () => {
    expect(APP_KEYS).toEqual([
      'customer',
      'store-details',
      'checkout',
      'order-tracking',
      'store-manager',
      'captain',
      'admin',
    ]);
  });

  it('contains the home app of every role', () => {
    for (const role of Object.values(UserRole)) {
      expect(APP_KEYS).toContain(primaryAppForRole(role));
    }
  });
});