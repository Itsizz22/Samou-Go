import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus, UserRole } from '@samou-go/shared-types';
import { updateOrderStatus } from './orders.service';
import { HttpError } from '../../lib/http-error';

/**
 * Unit tests for the order state machine gates in `updateOrderStatus`.
 *
 * `prisma` is mocked so each test seeds a single current order and records the
 * write the service would commit. The state-machine violations (illegal
 * transition, unchanged status, closed order, closed cancel window) must
 * surface as structured HTTP 400 errors with a machine-readable code — NOT 422,
 * which is reserved for malformed bodies.
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
    order: buildOrder(),
    /** store ids returned for `storeIdsManagedBy` (manager ownership). */
    storeIds: ['store-1'],
    captainProfile: {
      id: 'captain-1',
      isActive: true,
      isVerified: true,
      isAvailable: true,
    },
  };

  const tx = {
    order: {
      update: vi.fn(async ({ data }: any) => {
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
    order: { findUnique: vi.fn(async () => h.state.order) },
    store: { findMany: vi.fn(async () => h.state.storeIds.map(id => ({ id }))) },
    user: { findUnique: vi.fn(async () => h.state.captainProfile) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(h.tx),
  },
}));

vi.mock('../../config/env', () => ({
  env: { deliveryFeeConfig: { baseFee: 0, bulkFee: 0, bulkThreshold: 5, currency: 'ILS' } },
}));

/** Asserts a state-machine violation: HTTP 400 with the given code. */
function expectBadState(promise: Promise<unknown>, code: string) {
  return promise.then(
    () => {
      throw new Error(`expected ${code} but updateOrderStatus resolved`);
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(HttpError);
      const http = error as HttpError;
      expect(http.statusCode).toBe(400);
      expect(http.code).toBe(code);
    }
  );
}

beforeEach(() => {
  h.state.order = h.buildOrder(); // fresh PENDING order, no captain
  h.state.storeIds = ['store-1'];
  h.state.captainProfile = {
    id: 'captain-1',
    isActive: true,
    isVerified: true,
    isAvailable: true,
  };
  vi.clearAllMocks();
});

const manager = { sub: 'manager-1', role: UserRole.STORE_MANAGER };
const captain = { sub: 'captain-1', role: UserRole.CAPTAIN };
const customer = { sub: 'customer-1', role: UserRole.CUSTOMER };
const admin = { sub: 'admin-1', role: UserRole.ADMIN };

const set = (actor: { sub: string; role: UserRole }, status: OrderStatus) =>
  updateOrderStatus(actor, 'order-1', { status });

/* ---------------------------------------------------------------------------
 * Legal transitions — each one resolves and commits the write
 * ------------------------------------------------------------------------- */

describe('legal transitions', () => {
  it('manager accepts a PENDING order', async () => {
    // order starts PENDING
    const result = await set(manager, OrderStatus.ACCEPTED);
    expect(result.status).toBe(OrderStatus.ACCEPTED);
    expect(h.tx.order.update).toHaveBeenCalledTimes(1);
    // The write must be optimistic-locked on the status that was read, so a
    // concurrent transition cannot both pass the gates and then commit.
    const call = h.tx.order.update.mock.calls[0]![0];
    expect(call.where.status).toBe(OrderStatus.PENDING);
  });

  it('store walks ACCEPTED -> PREPARING -> READY_FOR_PICKUP', async () => {
    h.state.order = h.buildOrder({ status: OrderStatus.ACCEPTED });
    expect((await set(manager, OrderStatus.PREPARING)).status).toBe(OrderStatus.PREPARING);

    h.state.order = h.buildOrder({ status: OrderStatus.PREPARING });
    expect((await set(manager, OrderStatus.READY_FOR_PICKUP)).status).toBe(OrderStatus.READY_FOR_PICKUP);
  });

  it('customer may cancel while the order is still PENDING', async () => {
    const result = await set(customer, OrderStatus.CANCELLED);
    expect(result.status).toBe(OrderStatus.CANCELLED);
  });

  it('captain claims an unassigned READY_FOR_PICKUP job and is auto-assigned', async () => {
    h.state.order = h.buildOrder({ status: OrderStatus.READY_FOR_PICKUP });

    const result = await set(captain, OrderStatus.ON_THE_WAY);

    expect(result.status).toBe(OrderStatus.ON_THE_WAY);
    expect(result.captainId).toBe('captain-1');
    const call = h.tx.order.update.mock.calls[0]![0];
    expect(call.where.captainId).toBeNull(); // optimistic lock filter present
    expect(call.data.captainId).toBe('captain-1');
  });

  it('assigned captain may deliver ON_THE_WAY -> DELIVERED', async () => {
    h.state.order = h.buildOrder({ status: OrderStatus.ON_THE_WAY, captainId: 'captain-1' });

    const result = await set(captain, OrderStatus.DELIVERED);
    expect(result.status).toBe(OrderStatus.DELIVERED);
  });

  it('admin may force a legal jump the kitchen owns', async () => {
    h.state.order = h.buildOrder({ status: OrderStatus.PREPARING });
    const result = await set(admin, OrderStatus.READY_FOR_PICKUP);
    expect(result.status).toBe(OrderStatus.READY_FOR_PICKUP);
  });
});

/* ---------------------------------------------------------------------------
 * State-machine violations — structured 400s
 * ------------------------------------------------------------------------- */

describe('state-machine violations return structured 400 errors', () => {
  it('skipping a step: PENDING -> PREPARING is an ILLEGAL_TRANSITION', () => {
    return expectBadState(set(manager, OrderStatus.PREPARING), 'ILLEGAL_TRANSITION');
  });

  it('jumping ahead: READY_FOR_PICKUP -> DELIVERED skips ON_THE_WAY', () => {
    h.state.order = h.buildOrder({ status: OrderStatus.READY_FOR_PICKUP });
    return expectBadState(set(captain, OrderStatus.DELIVERED), 'ILLEGAL_TRANSITION');
  });

  it('same status again is STATUS_UNCHANGED', () => {
    h.state.order = h.buildOrder({ status: OrderStatus.ACCEPTED });
    return expectBadState(set(manager, OrderStatus.ACCEPTED), 'STATUS_UNCHANGED');
  });

  it('a DELIVERED order is closed: ORDER_CLOSED', () => {
    h.state.order = h.buildOrder({ status: OrderStatus.DELIVERED });
    return expectBadState(set(manager, OrderStatus.CANCELLED), 'ORDER_CLOSED');
  });

  it('a CANCELLED order is closed: ORDER_CLOSED', () => {
    h.state.order = h.buildOrder({ status: OrderStatus.CANCELLED });
    return expectBadState(set(manager, OrderStatus.ACCEPTED), 'ORDER_CLOSED');
  });

  it('customer cancel after cooking started: CANCEL_WINDOW_CLOSED', () => {
    h.state.order = h.buildOrder({ status: OrderStatus.PREPARING });
    return expectBadState(set(customer, OrderStatus.CANCELLED), 'CANCEL_WINDOW_CLOSED');
  });

  it('role not allowed to set the status stays a 403, not a 400', async () => {
    // PENDING -> ACCEPTED is legal in the state machine, but a captain may not
    // accept orders — that stays FORBIDDEN (403), not a state-machine 400.
    await set(captain, OrderStatus.ACCEPTED).then(
      () => {
        throw new Error('expected FORBIDDEN but updateOrderStatus resolved');
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(HttpError);
        const http = error as HttpError;
        expect(http.statusCode).toBe(403);
        expect(http.code).toBe('FORBIDDEN');
      }
    );
  });
});
