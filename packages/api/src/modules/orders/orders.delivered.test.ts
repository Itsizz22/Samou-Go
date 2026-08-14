import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus, UserRole } from '@samou-go/shared-types';
import { updateOrderStatus } from './orders.service';
import { creditDeliveredOrder } from '../platform/platform.service';

/**
 * P0-2 wiring: the DELIVERED transition must credit the store + captain wallets
 * INSIDE the same transaction as the status change (the credit helper itself is
 * unit-tested in `platform.service.test.ts`). The transaction's optimistic lock
 * means exactly one DELIVERED transition can commit, so credits run exactly once.
 */

const h = vi.hoisted(() => {
  const buildOrder = (overrides: Record<string, unknown> = {}) => {
    const base = {
      id: 'order-1',
      orderNumber: 'SG-260816-0001',
      customerId: 'customer-1',
      storeId: 'store-1',
      captainId: 'captain-1',
      status: 'ON_THE_WAY',
      customerAddressText: 'حارة الرأس، بجانب المسجد',
      addressNote: null,
      subtotal: 100,
      deliveryFee: 15,
      discount: 0,
      totalAmount: 115,
      voucherId: null,
      paymentMethod: 'COD',
      createdAt: new Date('2026-08-16T10:00:00.000Z'),
      updatedAt: new Date('2026-08-16T10:00:00.000Z'),
      items: [],
      customer: { id: 'customer-1', name: 'عميل', phone: '0599000000' },
      store: { id: 'store-1', nameAr: 'متجر', nameEn: 'Store', phone: '0599000001', latitude: null, longitude: null },
      captain: { id: 'captain-1', name: 'كابتن', phone: '0599000002' },
      voucher: null,
      statusHistory: [],
    };
    return { ...base, ...overrides };
  };

  const state = {
    order: buildOrder(),
  };

  const tx = {
    order: {
      update: vi.fn(async ({ data }: any) => {
        const updated = buildOrder({ ...state.order, status: data.status });
        state.order = updated;
        return updated;
      }),
    },
  };

  return { state, tx, buildOrder };
});

vi.mock('../../lib/prisma', () => ({
  prisma: {
    order: { findUnique: vi.fn(async () => h.state.order) },
    store: { findMany: vi.fn(async () => [{ id: 'store-1' }]) },
    user: { findUnique: vi.fn() },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(h.tx),
  },
}));

vi.mock('../../modules/platform/platform.service', () => ({
  creditDeliveredOrder: vi.fn(async () => undefined),
}));

// orders.service reads `env.deliveryFeeConfig`; the real env module throws in
// the test environment (no JWT_SECRET), so stub it like the other suites do.
vi.mock('../../config/env', () => ({
  env: { isProduction: false, deliveryFeeConfig: { baseFee: 0, bulkFee: 0, bulkThreshold: 5, currency: 'ILS' } },
}));

beforeEach(() => {
  h.state.order = h.buildOrder();
  vi.clearAllMocks();
});

describe('updateOrderStatus → DELIVERED wallet credits (P0-2)', () => {
  const captain = { sub: 'captain-1', role: UserRole.CAPTAIN };

  it('credits both wallets inside the same transaction as the status change', async () => {
    const result = await updateOrderStatus(captain, 'order-1', { status: OrderStatus.DELIVERED });

    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(h.tx.order.update).toHaveBeenCalledTimes(1);
    expect(creditDeliveredOrder).toHaveBeenCalledTimes(1);
    expect(creditDeliveredOrder).toHaveBeenCalledWith(h.tx, {
      storeId: 'store-1',
      captainId: 'captain-1',
      subtotal: 100,
      deliveryFee: 15,
      orderNumber: 'SG-260816-0001',
    });
  });

  it('does not credit wallets on any non-delivery transition', async () => {
    h.state.order = h.buildOrder({ status: 'PENDING', captainId: null });
    const manager = { sub: 'manager-1', role: UserRole.STORE_MANAGER };

    await updateOrderStatus(manager, 'order-1', { status: OrderStatus.ACCEPTED });

    expect(creditDeliveredOrder).not.toHaveBeenCalled();
  });
});
