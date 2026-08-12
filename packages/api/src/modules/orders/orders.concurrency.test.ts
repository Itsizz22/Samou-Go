import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus, UserRole } from '@samou-go/shared-types';
import { createOrder, updateOrderStatus } from './orders.service';
import { HttpError } from '../../lib/http-error';

/**
 * Concurrency tests for the two race conditions that actually matter:
 *
 *   1. Order numbers. `createOrder` mints the per-day sequence via an ATOMIC
 *      `dailyOrderSequence` upsert+increment inside the order transaction —
 *      NOT a `COUNT(*)` + retry loop. The mock's counter behaves like the DB's
 *      row lock: each call bumps before it returns, so N concurrent orders must
 *      get N distinct, gapless numbers.
 *
 *   2. Captain claims. Two captains claim the same READY_FOR_PICKUP order at
 *      once. `tx.order.update` carries `where.captainId = null` (optimistic
 *      lock); the second writer matches zero rows → Prisma P2025 → 409.
 *      Exactly one claim succeeds.
 */

const h = vi.hoisted(() => {
  const buildOrder = (overrides: Record<string, unknown> = {}) => {
    const base = {
      id: 'order-1',
      orderNumber: 'SG-260808-0001',
      customerId: 'customer-1',
      storeId: 'store-1',
      captainId: null,
      status: 'PENDING',
      customerAddressText: 'حارة الرأس، بجانب المسجد',
      addressNote: null,
      subtotal: 30,
      deliveryFee: 0,
      discount: 0,
      totalAmount: 30,
      voucherId: null,
      paymentMethod: 'COD',
      createdAt: new Date('2026-08-08T10:00:00.000Z'),
      updatedAt: new Date('2026-08-08T10:00:00.000Z'),
      items: [],
      customer: { id: 'customer-1', name: 'عميل', phone: '0599000000' },
      store: { id: 'store-1', nameAr: 'متجر', nameEn: 'Store', phone: '0599000001' },
      captain: null,
      voucher: null,
      statusHistory: [],
    };
    return { ...base, ...overrides };
  };

  const state = {
    /* createOrder path */
    store: { id: 'store-1', isActive: true },
    products: [{ id: 'p-chicken', nameAr: 'شاورما دجاج', price: 15, isAvailable: true }],
    /** Emulates the DB row lock of `daily_order_sequences`. */
    sequence: 0,
    orderCreateCalls: 0,

    /* updateOrderStatus path */
    order: buildOrder(),
    captainProfile: { id: 'captain-1', isActive: true, isVerified: true, isAvailable: true },
    /** Simulates PostgreSQL row version for optimistic locking. */
    orderVersion: 0,
    /** Tracks which captain claimed this order (optimistic lock). */
    claimedBy: null as string | null,
  };

  const buildFakeOrder = (data: any) => {
    const now = new Date('2026-08-08T12:00:00.000Z');
    return {
      id: 'order-1',
      orderNumber: data.orderNumber,
      customerId: data.customerId,
      storeId: data.storeId,
      captainId: null,
      status: data.status,
      customerAddressText: data.customerAddressText,
      addressNote: data.addressNote ?? null,
      subtotal: data.subtotal,
      deliveryFee: data.deliveryFee,
      discount: data.discount,
      totalAmount: data.totalAmount,
      voucherId: data.voucherId ?? null,
      paymentMethod: data.paymentMethod,
      createdAt: now,
      updatedAt: now,
      items: (data.items?.create ?? []).map((line: any, i: number) => ({
        id: `item-${i}`,
        orderId: 'order-1',
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.totalPrice,
        product: { id: line.productId, nameAr: `Product ${line.productId}`, imageUrl: null },
      })),
      customer: { id: data.customerId, name: 'Customer', phone: '0599000000' },
      store: { id: data.storeId, nameAr: 'Store', nameEn: 'Store', phone: '0599000001' },
      captain: null,
      voucher: null,
      statusHistory: (data.statusHistory?.create ? [data.statusHistory.create] : []).map(
        (entry: any, i: number) => ({
          id: `hist-${i}`,
          orderId: 'order-1',
          status: entry.status,
          changedByUserId: entry.changedByUserId ?? null,
          note: entry.note ?? null,
          createdAt: now,
        })
      ),
    };
  };

  const tx = {
    store: { findUnique: vi.fn(async () => state.store) },
    product: { findMany: vi.fn(async () => state.products) },
    dailyOrderSequence: {
      upsert: vi.fn(async () => {
        state.sequence += 1;
        return { date: new Date(), sequence: state.sequence };
      }),
    },
    order: {
      create: vi.fn(async ({ data }: any) => {
        state.orderCreateCalls += 1;
        return buildFakeOrder(data);
      }),
      update: vi.fn(async ({ where, data }: any) => {
        // Yield to allow the other concurrent promise to interleave.
        await Promise.resolve();
        
        // Emulate PostgreSQL optimistic lock: track claim attempts via a set
        // to ensure exactly one captain succeeds. For captain claims
        // (where.captainId = nil), use claim tracking; for other
        // transitions, use status-based optimistic lock.
        if (where.captainId === null) {
          // Captain claim: only the first concurrent claim succeeds.
          if (h.state._claimTracking.has(where.captainId ?? 'unknown')) {
            const err: any = new Error('No Order record matches the filter');
            err.code = 'P2025';
            throw err;
          }
          h.state._claimTracking.add(where.captainId ?? 'unknown');
          state.claimedBy = data.captainId;
          // Build updated order without status check for claims
          const updated = buildOrder({
            ...state.order,
            status: data.status,
            ...(data.captainId !== undefined ? { captainId: data.captainId } : {}),
          });
          state.order = updated;
          return updated;
        }
        
        // General optimistic lock for non-claim transitions:
        // the write filters on `where.status = capturedStatus`.
        // If the order was updated concurrently, the filter matches zero rows
        // → Prisma throws P2025, which we surface as a 409 CONFLICT.
        if (state.order && where.status !== state.order.status) {
          const err: any = new Error('No Order record matches the filter');
          err.code = 'P2025';
          throw err;
        }
        const updated = buildOrder({
          ...state.order,
          status: data.status,
          ...(data.captainId !== undefined ? { captainId: data.captainId } : {}),
        });
        state.order = updated;
        return updated;
      }),
    },
  };

  return { state, tx, buildOrder };
});

vi.mock('../../lib/prisma', () => ({
  prisma: {
    order: {
      findUnique: vi.fn(async () => h.state.order),
    },
    store: {
      findUnique: h.tx.store.findUnique,
      findMany: vi.fn(async () => [{ id: 'store-1' }]),
    },
    product: { findMany: h.tx.product.findMany },
    user: { findUnique: vi.fn(async () => h.state.captainProfile) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(h.tx),
  },
}));

vi.mock('../../config/env', () => ({
    env: { deliveryFeeConfig: { baseFee: 0, bulkFee: 0, bulkThreshold: 5, currency: 'ILS' } },
  }));

beforeEach(() => {
  h.state.sequence = 0;
  h.state.orderCreateCalls = 0;
  h.state.order = null;
  h.state.orderVersion = 0;
  h.state.claimedBy = null;
  h.state._claimTracking = new Set();
  h.state.captainProfile = { id: 'captain-1', isActive: true, isVerified: true, isAvailable: true };
  vi.clearAllMocks();
});

/* ---------------------------------------------------------------------------
 * 1. Order numbers under concurrent creation
 * ------------------------------------------------------------------------- */

describe('order numbering under concurrency', () => {
  const BASE_BODY = {
    storeId: 'store-1',
    customerAddressText: 'حارة الرأس، بجانب المسجد',
  };

  it('mints unique, gapless order numbers for 10 simultaneous orders', async () => {
    const orders = await Promise.all(
      Array.from({ length: 10 }, () =>
        createOrder('customer-1', { ...BASE_BODY, items: [{ productId: 'p-chicken', quantity: 1 }] })
      )
    );

    const numbers = orders.map(order => order.orderNumber);
    expect(new Set(numbers).size).toBe(10);

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const expected = Array.from({ length: 10 }, (_, i) => `SG-${yy}${mm}${dd}-${String(i + 1).padStart(4, '0')}`);

    expect(numbers.sort()).toEqual(expected.sort());
    expect(h.state.orderCreateCalls).toBe(10);
    // Every upsert returned a strictly increasing, lock-free-of-observers value.
    expect(h.state.sequence).toBe(10);
  });

  it('bumps the daily sequence exactly once per order', async () => {
    await createOrder('customer-1', { ...BASE_BODY, items: [{ productId: 'p-chicken', quantity: 1 }] });
    expect(h.tx.dailyOrderSequence.upsert).toHaveBeenCalledTimes(1);
    expect(h.tx.order.create).toHaveBeenCalledTimes(1);
  });
});

/* ---------------------------------------------------------------------------
 * 2. Captain claim race (optimistic lock)
 * ------------------------------------------------------------------------- */

describe('captain claim race', () => {
  const captain1 = { sub: 'captain-1', role: UserRole.CAPTAIN };
  const captain2 = { sub: 'captain-2', role: UserRole.CAPTAIN };

  it('two captains claiming the same job: one 200, one 409', async () => {
    h.state.order = h.buildOrder({ status: OrderStatus.READY_FOR_PICKUP });

    const [winner, loser] = await Promise.allSettled([
      updateOrderStatus(captain1, 'order-1', { status: OrderStatus.ON_THE_WAY }),
      updateOrderStatus(captain2, 'order-1', { status: OrderStatus.ON_THE_WAY }),
    ]);

    const won = winner.status === 'fulfilled' ? winner : loser;
    const lost = winner.status === 'fulfilled' ? loser : winner;

    expect(won.status).toBe('fulfilled');
    const detail = (won as PromiseFulfilledResult<any>).value;
    expect(detail.status).toBe(OrderStatus.ON_THE_WAY);
    expect(detail.captainId).toBe(h.state.claimedBy);
    expect([captain1.sub, captain2.sub]).toContain(detail.captainId);

    expect(lost.status).toBe('rejected');
    const reason = (lost as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(HttpError);
    expect(reason.statusCode).toBe(409);
    expect(reason.code).toBe('CONFLICT');
  });

  it('the same captain claiming twice: first wins, second gets a 409', async () => {
    h.state.order = h.buildOrder({ status: OrderStatus.READY_FOR_PICKUP });

    const [first, second] = await Promise.allSettled([
      updateOrderStatus(captain1, 'order-1', { status: OrderStatus.ON_THE_WAY }),
      updateOrderStatus(captain1, 'order-1', { status: OrderStatus.ON_THE_WAY }),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    const reason = (second as PromiseRejectedResult).reason;
    expect(reason.statusCode).toBe(409);
  });
});

/* ---------------------------------------------------------------------------
 * 3. Concurrent non-claim transitions — the state machine must not be
 *    corrupted by two writers racing on the same read
 * ------------------------------------------------------------------------- */

describe('concurrent status transitions (state machine race)', () => {
  it('customer cancels while the store accepts: exactly one commits, the loser gets a 409', async () => {
    // Both callers read the SAME ACCEPTED order; one of the writes commits and
    // the other's `where.status = ACCEPTED` optimistic lock matches zero rows.
    h.state.order = h.buildOrder({ status: OrderStatus.ACCEPTED });

    const [cancel, accept] = await Promise.allSettled([
      updateOrderStatus({ sub: 'customer-1', role: UserRole.CUSTOMER }, 'order-1', {
        status: OrderStatus.CANCELLED,
      }),
      updateOrderStatus({ sub: 'manager-1', role: UserRole.STORE_MANAGER }, 'order-1', {
        status: OrderStatus.PREPARING,
      }),
    ]);

    const won = cancel.status === 'fulfilled' ? cancel : accept;
    const lost = cancel.status === 'fulfilled' ? accept : cancel;

    expect(won.status).toBe('fulfilled');
    expect((won as PromiseFulfilledResult<any>).value.status).not.toBe(OrderStatus.ACCEPTED);

    expect(lost.status).toBe('rejected');
    const reason = (lost as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(HttpError);
    expect(reason.statusCode).toBe(409);
    expect(reason.code).toBe('CONFLICT');
  });

  it('two managers racing ACCEPTED -> PREPARING: one wins, one is told to retry', async () => {
    h.state.order = h.buildOrder({ status: OrderStatus.ACCEPTED });

    const [first, second] = await Promise.allSettled([
      updateOrderStatus({ sub: 'manager-1', role: UserRole.STORE_MANAGER }, 'order-1', {
        status: OrderStatus.PREPARING,
      }),
      updateOrderStatus({ sub: 'manager-2', role: UserRole.STORE_MANAGER }, 'order-1', {
        status: OrderStatus.PREPARING,
      }),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    const reason = (second as PromiseRejectedResult).reason;
    expect(reason.statusCode).toBe(409);
    expect(reason.code).toBe('CONFLICT');
  });
});