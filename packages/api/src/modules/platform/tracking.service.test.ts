import { beforeEach, expect, it, vi } from 'vitest';
import { UserRole } from '@samou-go/shared-types';
const mocks = vi.hoisted(() => ({ order: vi.fn(), location: vi.fn(), route: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { order: { findUnique: mocks.order }, captainLocation: { findUnique: mocks.location } } }));
vi.mock('./platform.service', () => ({ getPlatformSettings: async () => ({ gpsCaptureEnabled: true }) }));
vi.mock('./road-routing', () => ({ createRoadRouter: () => mocks.route }));
import { getTracking } from './tracking.service';
const auth = { sub: 'customer', role: UserRole.CUSTOMER };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.mockResolvedValue({ customerId: 'customer', captainId: 'captain', fulfillmentType: 'DELIVERY', status: 'ON_THE_WAY', latitude: 31.4, longitude: 35.07, store: { managerId: 'store', latitude: 31.41, longitude: 35.08, nameAr: 'Store' } });
  mocks.location.mockResolvedValue({ lat: 31.42, lng: 35.06, updatedAt: new Date() });
  mocks.route.mockResolvedValue(null);
});
it('does not label a future GPS reading live or request a route from it', async () => {
  mocks.location.mockResolvedValue({ lat: 31.42, lng: 35.06, updatedAt: new Date(Date.now() + 60000) });
  expect((await getTracking(auth, 'order')).stale).toBe(true);
  expect(mocks.route).not.toHaveBeenCalled();
});
it('does not expose malformed legacy coordinates to the map', async () => {
  mocks.location.mockResolvedValue({ lat: 999, lng: 35.06, updatedAt: new Date() });
  const result = await getTracking(auth, 'order');
  expect(result.location).toBeNull();
  expect(result.distanceMeters).toBeNull();
  expect(mocks.route).not.toHaveBeenCalled();
});
