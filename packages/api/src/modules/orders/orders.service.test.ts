import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '@samou-go/shared-types';
import { createOrder, quoteOrder } from './orders.service';
import { HttpError } from '../../lib/http-error';

/**
 * Unit tests for the money-critical order pipeline.
 *
 * The real database is not required: `prisma` is mocked so `$transaction`
 * executes its callback against a fake transactional client. That fake records
 * exactly what would be committed, so these tests prove:
 *
 *   1. The server — not the client — computes subtotal, delivery fee and total
 *      from the products table (server-authoritative pricing).
 *   2. The delivery fee follows the tariff: 0 for 0 items, 3 ₪ for 1–4,
 *      5 ₪ for 5+.
 *   3. Any failure inside the pipeline (unavailable product, wrong store,
 *      closed store, exhausted voucher) aborts the unit of work — `order.create`
 *      is never reached, i.e. nothing is written (transaction rollback).
 */

const h = vi.hoisted(() => {
  const defaultProducts = [
    { id: 'p-chicken', nameAr: 'شاورما دجاج', price: 15, isAvailable: true },
    { id: 'p-meat', nameAr: 'شاورما لحم', price: 22, isAvailable: true },
  ];

  const state = {
    store: { id: 'store-1', isActive: true },
    products: defaultProducts,
    voucher: null as null | {
      id: string;
      code: string;
      labelAr: string;
      labelEn: string;
      isActive: boolean;
      discountType: 'PERCENT' | 'FIXED';
      discountValue: number;
      minSubtotal: number | null;
      maxDiscount: number | null;
      usageLimit: number | null;
      usedCount: number;
      startsAt: Date | null;
      expiresAt: Date | null;
    },
    todayOrders: 0,
    redeemCount: 1,
    orderCreateCalls: 0,
    /** Emulates the atomic per-day counter bumped by `dailyOrderSequence.upsert`. */
    sequence: 0,
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
    voucher: {
      findUnique: vi.fn(async () => state.voucher),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: state.redeemCount })),
    },
    order: {
      count: vi.fn(async () => state.todayOrders),
      create: vi.fn(async ({ data }: any) => {
        state.orderCreateCalls += 1;
        return buildFakeOrder(data);
      }),
    },
    dailyOrderSequence: {
      upsert: vi.fn(async () => {
        state.sequence += 1;
        return { date: new Date(), sequence: state.sequence };
      }),
    },
  };

  return { state, tx };
});

vi.mock('../../lib/prisma', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(h.tx),
    store: { findUnique: h.tx.store.findUnique },
    product: { findMany: h.tx.product.findMany },
    voucher: { findUnique: h.tx.voucher.findUnique },
  },
}));

vi.mock('../../config/env', () => ({
  env: {
    deliveryFeeConfig: { baseFee: 3, bulkFee: 5, bulkThreshold: 5, currency: 'ILS' },
  },
}));

const BASE_BODY = {
  storeId: 'store-1',
  customerAddressText: 'حارة الرأس، بجانب المسجد',
  addressNote: 'الطابق الثاني',
};

function item(productId: string, quantity: number) {
  return { productId, quantity };
}

/** Asserts an HttpError was thrown with the given code. */
function expectHttpError(promise: Promise<unknown>, code: string, status = 422) {
  return promise.then(
    () => {
      throw new Error(`expected ${code} but createOrder resolved`);
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(HttpError);
      const http = error as HttpError;
      expect(http.code).toBe(code);
      expect(http.statusCode).toBe(status);
    }
  );
}

beforeEach(() => {
  h.state.store = { id: 'store-1', isActive: true };
  h.state.products = [
    { id: 'p-chicken', nameAr: 'شاورما دجاج', price: 15, isAvailable: true },
    { id: 'p-meat', nameAr: 'شاورما لحم', price: 22, isAvailable: true },
  ];
  h.state.voucher = null;
  h.state.todayOrders = 0;
  h.state.redeemCount = 1;
  h.state.orderCreateCalls = 0;
  h.state.sequence = 0;
  vi.clearAllMocks();
});

/* ---------------------------------------------------------------------------
 * Server-authoritative pricing — the client never supplies money
 * ------------------------------------------------------------------------- */

describe('server-authoritative pricing', () => {
  it('prices the basket from the products table, ignoring any client totals', async () => {
    // The request body carries NO money fields (they are stripped by the zod
    // schema), but even if a hostile client sneaks them through an `as any`
    // cast, the service never reads them — it only looks at productId/quantity.
    const body = {
      ...BASE_BODY,
      items: [item('p-chicken', 2), item('p-meat', 1)],
      subtotal: 1,
      deliveryFee: 0,
      totalAmount: 1,
    } as never;

    const order = await createOrder('customer-1', body);

    expect(order.subtotal).toBe(52); // 2×15 + 1×22
    expect(order.deliveryFee).toBe(3); // 3 items → base fee
    expect(order.totalAmount).toBe(55);
    expect(order.items.map(l => [l.productId, l.unitPrice, l.quantity])).toEqual([
      ['p-chicken', 15, 2],
      ['p-meat', 22, 1],
    ]);
    expect(h.state.orderCreateCalls).toBe(1);
  });

  it('merges duplicate productIds into a single order line', async () => {
    const order = await createOrder('customer-1', {
      ...BASE_BODY,
      items: [item('p-chicken', 2), item('p-chicken', 3)],
    });

    expect(order.subtotal).toBe(75); // 5 × 15
    expect(order.deliveryFee).toBe(5); // 5 items → bulk fee
    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.quantity).toBe(5);
  });
});

/* ---------------------------------------------------------------------------
 * Delivery fee tariff — 0 / 3 ₪ / 5 ₪
 * ------------------------------------------------------------------------- */

describe('delivery fee schedule', () => {
  it('charges the base fee (3 ₪) for 1 item', async () => {
    const order = await createOrder('customer-1', {
      ...BASE_BODY,
      items: [item('p-chicken', 1)],
    });
    expect(order.deliveryFee).toBe(3);
    expect(order.subtotal).toBe(15);
    expect(order.totalAmount).toBe(18);
  });

  it('charges the base fee (3 ₪) for 4 items — just under the threshold', async () => {
    const order = await createOrder('customer-1', {
      ...BASE_BODY,
      items: [item('p-chicken', 4)],
    });
    expect(order.deliveryFee).toBe(3);
    expect(order.totalAmount).toBe(63);
  });

  it('charges the bulk fee (5 ₪) at exactly 5 items', async () => {
    const order = await createOrder('customer-1', {
      ...BASE_BODY,
      items: [item('p-chicken', 5)],
    });
    expect(order.deliveryFee).toBe(5);
    expect(order.totalAmount).toBe(80);
  });

  it('quotes the same fee the order will be charged', async () => {
    const quote = await quoteOrder({
      storeId: 'store-1',
      items: [item('p-chicken', 5)],
    });
    expect(quote.deliveryFee).toBe(5);
    expect(quote.subtotal).toBe(75);
    expect(quote.totalAmount).toBe(80);
  });
});

/* ---------------------------------------------------------------------------
 * Transaction rollback — a failing step writes nothing
 * ------------------------------------------------------------------------- */

describe('transaction rollback', () => {
  it('writes nothing when a product is unavailable', async () => {
    h.state.products = [
      { id: 'p-chicken', nameAr: 'شاورما دجاج', price: 15, isAvailable: false },
    ];

    await expectHttpError(
      createOrder('customer-1', { ...BASE_BODY, items: [item('p-chicken', 1)] }),
      'PRODUCT_UNAVAILABLE'
    );

    expect(h.state.orderCreateCalls).toBe(0);
    expect(h.tx.voucher.update).not.toHaveBeenCalled();
  });

  it('writes nothing when a product belongs to another store', async () => {
    h.state.products = [];

    await expectHttpError(
      createOrder('customer-1', { ...BASE_BODY, items: [item('p-foreign', 1)] }),
      'PRODUCT_NOT_IN_STORE'
    );

    expect(h.state.orderCreateCalls).toBe(0);
  });

  it('writes nothing when the store is closed', async () => {
    h.state.store = { id: 'store-1', isActive: false };

    await expectHttpError(
      createOrder('customer-1', { ...BASE_BODY, items: [item('p-chicken', 1)] }),
      'STORE_CLOSED'
    );

    expect(h.state.orderCreateCalls).toBe(0);
  });

  it('rolls back when the voucher redemption guard trips', async () => {
    h.state.voucher = {
      id: 'v-1',
      code: 'SAVE10',
      labelAr: 'توفير',
      labelEn: 'Save',
      isActive: true,
      discountType: 'PERCENT',
      discountValue: 10,
      minSubtotal: null,
      maxDiscount: null,
      usageLimit: 5,
      usedCount: 5, // already exhausted
      startsAt: null,
      expiresAt: null,
    };

    await expectHttpError(
      createOrder('customer-1', {
        ...BASE_BODY,
        items: [item('p-chicken', 1)],
        voucherCode: 'save10',
      }),
      'VOUCHER_USAGE_LIMIT'
    );

    expect(h.state.orderCreateCalls).toBe(0);
  });

  it('rejects an order for a store that does not exist', async () => {
    h.state.store = null as never;

    await expectHttpError(
      createOrder('customer-1', { ...BASE_BODY, items: [item('p-chicken', 1)] }),
      'NOT_FOUND',
      404
    );

    expect(h.state.orderCreateCalls).toBe(0);
  });

  it('applies a server-resolved voucher discount to the total', async () => {
    h.state.voucher = {
      id: 'v-1',
      code: 'SAVE10',
      labelAr: 'توفير',
      labelEn: 'Save',
      isActive: true,
      discountType: 'PERCENT',
      discountValue: 10,
      minSubtotal: null,
      maxDiscount: null,
      usageLimit: null,
      usedCount: 0,
      startsAt: null,
      expiresAt: null,
    };

    const order = await createOrder('customer-1', {
      ...BASE_BODY,
      items: [item('p-chicken', 2)], // subtotal 30, fee 3, total 33
      voucherCode: 'save10',
    });

    expect(order.discount).toBe(3); // 10% of 30
    expect(order.totalAmount).toBe(30); // 33 − 3
    expect(h.tx.voucher.update).toHaveBeenCalledTimes(1);
  });

  it('keeps status PENDING and writes one initial history entry', async () => {
    const order = await createOrder('customer-1', {
      ...BASE_BODY,
      items: [item('p-chicken', 1)],
    });

    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.statusHistory).toHaveLength(1);
    expect(order.statusHistory[0]!.status).toBe(OrderStatus.PENDING);
  });
});
