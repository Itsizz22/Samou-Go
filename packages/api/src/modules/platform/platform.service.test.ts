import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerEntryType, SettlementMethod, UserRole } from '@samou-go/shared-types';
import type { Prisma } from '../../lib/prisma-types';
import { HttpError } from '../../lib/http-error';
import {
  claimSettlement,
  computeOrderFinancials,
  creditDeliveredOrder,
  creditWallet,
  rateOrder,
  sendOrderChat,
  settleWallet,
} from './platform.service';

/**
 * Unit tests for the platform module's critical paths.
 *
 *  - F-1 settle: the balance decrement is a guarded `updateMany` (WHERE
 *    balance >= amount), so concurrent settlements can never both pass a stale
 *    read-then-write check. The fake transactional client behaves like the DB:
 *    it checks and decrements in one synchronous step.
 *  - rateOrder: only the order's own customer may rate, and only after delivery.
 *  - sendOrderChat: REST-side membership gating (the socket path is tested in
 *    `realtime-handlers.test.ts`).
 */

const h = vi.hoisted(() => {
  const state = {
    balance: 50,
    wallet: { id: 'wallet-1', userId: 'u-1', balance: 50 },
    /** Credit-path wallets: `balance` is a number, `commissionRate` a string. */
    wallets: [] as { id: string; userId: string | null; storeId: string | null; balance: number; commissionRate: string }[],
    settlements: [] as unknown[],
    ledgerEntries: [] as unknown[],
    order: null as Record<string, unknown> | null,
  };

  const toNum = (v: unknown): number =>
    typeof v === 'object' && v !== null && 'toNumber' in v
      ? (v as { toNumber(): number }).toNumber()
      : Number(v);
  const round2 = (v: number): number => Math.round(v * 100) / 100;

  const tx = {
    wallet: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const gte = where?.balance?.gte ?? 0;
        const amount = data?.balance?.decrement ?? 0;
        if (state.balance >= gte) {
          state.balance -= amount;
          return { count: 1 };
        }
        return { count: 0 };
      }),
      findUniqueOrThrow: vi.fn(async () => ({ id: 'wallet-1', balance: state.balance })),
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.storeId !== undefined ? 'storeId' : where.userId !== undefined ? 'userId' : 'id';
        const row = state.wallets.find(w => w[key] === where[key]);
        return row ? { commissionRate: row.commissionRate } : null;
      }),
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const key = where.storeId !== undefined ? 'storeId' : 'userId';
        let row = state.wallets.find(w => w[key] === where[key]);
        if (row) {
          const inc = update?.balance?.increment;
          if (inc !== undefined) row.balance = round2(row.balance + toNum(inc));
          return { id: row.id };
        }
        row = {
          id: `wallet-${state.wallets.length + 1}`,
          userId: null,
          storeId: null,
          ...create,
          balance: toNum(create.balance),
          commissionRate: '0.10',
        };
        state.wallets.push(row);
        return { id: row.id };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.wallets.find(w => w.id === where.id);
        if (!row) {
          const err: unknown = new Error('No Wallet record matches the filter');
          Object.assign(err as { code?: string }, { code: 'P2025' });
          throw err;
        }
        const inc = data?.balance?.increment;
        if (inc !== undefined) row.balance = round2(row.balance + toNum(inc));
        return { ...row };
      }),
    },
    settlement: {
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `settlement-${state.settlements.length + 1}`,
          walletId: data.walletId,
          amount: data.amount,
          method: data.method,
          note: data.note ?? null,
          createdAt: new Date('2026-08-08T10:00:00.000Z'),
        };
        state.settlements.push(row);
        return row;
      }),
    },
    ledgerEntry: {
      create: vi.fn(async ({ data }: any) => {
        state.ledgerEntries.push(data);
        return { id: `ledger-${state.ledgerEntries.length}`, ...data };
      }),
    },
  };

  return { state, tx };
});

vi.mock('../../lib/prisma', () => ({
  prisma: {
    order: { findUnique: vi.fn(async () => h.state.order) },
    rating: { create: vi.fn(async ({ data }: any) => data) },
    chatMessage: { create: vi.fn(async ({ data }: any) => ({ id: 'm-1', ...data })) },
    wallet: {
      findUnique: vi.fn(async () => h.state.wallet),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    settlement: { findMany: vi.fn() },
    captainLocation: { upsert: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(h.tx)),
  },
}));

// `prisma-runtime` (pulls the Decimal implementation) reads env at import time —
// there is no JWT_SECRET in the test environment, so the real env module would
// throw on load. Same pattern as the other API suites.
vi.mock('../../config/env', () => ({
  env: { isProduction: false, deliveryFeeConfig: { baseFee: 0, bulkFee: 0, bulkThreshold: 5, currency: 'ILS' } },
}));

import { prisma } from '../../lib/prisma';

beforeEach(() => {
  h.state.balance = 50;
  h.state.settlements = [];
  h.state.ledgerEntries = [];
  h.state.order = null;
  h.state.wallets = [
    { id: 'wallet-1', userId: 'u-1', storeId: null, balance: 50, commissionRate: '0.10' },
  ];
  vi.clearAllMocks();
});

const tx = h.tx as unknown as Prisma.TransactionClient;

describe('claimSettlement — F-1 atomic settle', () => {
  it('debits the wallet and writes settlement + ledger in one transaction', async () => {
    const result = await claimSettlement(tx, 'wallet-1', {
      amount: 30,
      method: SettlementMethod.CASH,
      note: 'Payout',
    });

    expect(result.balance).toBe(20);
    expect(result.settlement.amount).toBe(30);
    expect(h.state.settlements).toHaveLength(1);
    expect(h.state.ledgerEntries).toEqual([
      {
        walletId: 'wallet-1',
        amount: -30,
        type: LedgerEntryType.SETTLEMENT,
        description: 'Payout',
      },
    ]);
  });

  it('rejects a settlement the balance cannot cover with no partial writes', async () => {
    const promise = claimSettlement(tx, 'wallet-1', { amount: 999, method: SettlementMethod.CASH });

    await expect(promise).rejects.toBeInstanceOf(HttpError);
    await expect(promise).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
    expect(h.tx.settlement.create).not.toHaveBeenCalled();
    expect(h.tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(h.state.settlements).toHaveLength(0);
    expect(h.state.ledgerEntries).toHaveLength(0);
  });

  it('two concurrent settlements of one wallet: exactly one succeeds', async () => {
    const [first, second] = await Promise.allSettled([
      claimSettlement(tx, 'wallet-1', { amount: 30, method: SettlementMethod.CASH }),
      claimSettlement(tx, 'wallet-1', { amount: 30, method: SettlementMethod.CASH }),
    ]);

    const ok = first.status === 'fulfilled' ? first : second;
    const lost = first.status === 'fulfilled' ? second : first;
    expect(ok.status).toBe('fulfilled');
    expect(lost.status).toBe('rejected');
    expect((lost as PromiseRejectedResult).reason).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });

    expect(h.state.balance).toBe(20);
    expect(h.state.settlements).toHaveLength(1);
    expect(h.state.ledgerEntries).toHaveLength(1);
  });

  it('defaults the ledger description when no note is given', async () => {
    await claimSettlement(tx, 'wallet-1', { amount: 10, method: SettlementMethod.BANK_TRANSFER });

    expect(h.state.ledgerEntries[0]).toMatchObject({
      description: 'Admin settlement',
      amount: -10,
      type: LedgerEntryType.SETTLEMENT,
    });
  });
});

describe('settleWallet', () => {
  it('404 when the wallet does not exist — nothing is written', async () => {
    (prisma.wallet.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(
      settleWallet('nope', { amount: 10, method: SettlementMethod.CASH })
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('422 when the body is invalid — validated only after the wallet exists', async () => {
    await expect(
      settleWallet('wallet-1', { amount: -5, method: SettlementMethod.CASH })
    ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('settles through the real transaction path and returns DTO-shaped money', async () => {
    const result = await settleWallet('wallet-1', {
      amount: 20,
      method: SettlementMethod.BANK_TRANSFER,
      note: 'Settle',
    });

    expect(prisma.wallet.findUnique).toHaveBeenCalledWith({ where: { id: 'wallet-1' } });
    expect(result).toMatchObject({
      balance: 30,
      settlement: {
        walletId: 'wallet-1',
        amount: 20,
        method: SettlementMethod.BANK_TRANSFER,
        note: 'Settle',
      },
    });
  });
});

describe('rateOrder', () => {
  const delivered = {
    id: 'order-1',
    customerId: 'customer-1',
    storeId: 'store-1',
    captainId: 'captain-1',
    status: 'DELIVERED',
  };

  it('404 when the order does not belong to the caller', async () => {
    h.state.order = { ...delivered, customerId: 'someone-else' };

    await expect(rateOrder('order-1', 'customer-1', { storeRating: 5 })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(prisma.rating.create).not.toHaveBeenCalled();
  });

  it('400 when the order has not been delivered yet', async () => {
    h.state.order = { ...delivered, status: 'ACCEPTED' };

    await expect(rateOrder('order-1', 'customer-1', { storeRating: 5 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
    expect(prisma.rating.create).not.toHaveBeenCalled();
  });

  it('creates the rating once the order is delivered', async () => {
    h.state.order = delivered;

    await rateOrder('order-1', 'customer-1', {
      storeRating: 5,
      captainRating: 4,
      comment: 'ممتاز',
    });

    expect(prisma.rating.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        customerId: 'customer-1',
        storeId: 'store-1',
        captainId: 'captain-1',
        storeRating: 5,
        captainRating: 4,
        comment: 'ممتاز',
      },
    });
  });
});

describe('sendOrderChat — REST-side membership gating', () => {
  const party = {
    id: 'order-1',
    customerId: 'customer-1',
    captainId: 'captain-1',
    store: { managerId: 'manager-1' },
  };

  it('403 for a caller outside the order party', async () => {
    h.state.order = party;

    await expect(
      sendOrderChat(
        'order-1',
        { sub: 'stranger', role: UserRole.CUSTOMER },
        { orderId: 'order-1', message: 'hello' }
      )
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('allows the customer, the assigned captain, the store manager and admins', async () => {
    h.state.order = party;
    const actors = [
      { sub: 'customer-1', role: UserRole.CUSTOMER },
      { sub: 'captain-1', role: UserRole.CAPTAIN },
      { sub: 'manager-1', role: UserRole.STORE_MANAGER },
      { sub: 'admin-1', role: UserRole.ADMIN },
    ];

    for (const actor of actors) {
      await sendOrderChat('order-1', actor, { orderId: 'order-1', message: 'مرحبا' });
    }

    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(actors.length);
  });

  it('422 for an empty message', async () => {
    h.state.order = party;

    await expect(
      sendOrderChat(
        'order-1',
        { sub: 'customer-1', role: UserRole.CUSTOMER },
        { orderId: 'order-1', message: '   ' }
      )
    ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
 * P0-2 wallet credits
 * ------------------------------------------------------------------------- */

describe('computeOrderFinancials — Decimal math, never float', () => {
  it('splits subtotal, commission and delivery fee with the wallet rate', () => {
    const f = computeOrderFinancials('100.00', '15.00', '0.10');

    expect(f.gross.toFixed(2)).toBe('100.00');
    expect(f.commission.toFixed(2)).toBe('10.00');
    expect(f.storeNet.toFixed(2)).toBe('90.00');
    expect(f.captainPayout.toFixed(2)).toBe('15.00');
  });

  it('rounds commission half-up to 2dp', () => {
    const f = computeOrderFinancials('33.33', '0.00', '0.10');

    expect(f.commission.toFixed(2)).toBe('3.33');
    expect(f.storeNet.toFixed(2)).toBe('30.00');
  });

  it('applies the store wallet commission rate', () => {
    const f = computeOrderFinancials('200.00', '10.00', '0.15');

    expect(f.commission.toFixed(2)).toBe('30.00');
    expect(f.storeNet.toFixed(2)).toBe('170.00');
  });
});

describe('creditDeliveredOrder — atomic credits with ledger entries', () => {
  const order = {
    storeId: 'store-1',
    captainId: 'captain-1',
    subtotal: '100.00',
    deliveryFee: '15.00',
    orderNumber: 'SG-260816-0001',
  };

  it('creates both wallets and writes EARNING/COMMISSION ledgers in one transaction', async () => {
    await creditDeliveredOrder(tx, order);

    const storeWallet = h.state.wallets.find(w => w.storeId === 'store-1')!;
    const captainWallet = h.state.wallets.find(w => w.userId === 'captain-1')!;
    expect(storeWallet.balance).toBe(90);
    expect(captainWallet.balance).toBe(15);

    expect(h.state.ledgerEntries).toHaveLength(3);
    const [earning, commission, captainEarning] = h.state.ledgerEntries as any[];
    expect(earning).toMatchObject({
      walletId: storeWallet.id,
      type: LedgerEntryType.EARNING,
      description: 'أرباح المتجر عن الطلب SG-260816-0001 / Store earnings for order SG-260816-0001',
    });
    expect(earning.amount.toNumber()).toBe(100);
    expect(commission).toMatchObject({
      walletId: storeWallet.id,
      type: LedgerEntryType.COMMISSION,
      description: 'عمولة المنصة عن الطلب SG-260816-0001 / Platform commission for order SG-260816-0001',
    });
    expect(commission.amount.toNumber()).toBe(-10);
    expect(captainEarning).toMatchObject({
      walletId: captainWallet.id,
      type: LedgerEntryType.EARNING,
      description: 'أرباح التوصيل عن الطلب SG-260816-0001 / Delivery earnings for order SG-260816-0001',
    });
    expect(captainEarning.amount.toNumber()).toBe(15);
    // Balance reconciles exactly with the ledger: +100 −10 +15 = +105 across wallets.
    const delta = h.state.ledgerEntries.reduce((sum, entry: any) => sum + entry.amount.toNumber(), 0);
    expect(delta).toBe(105);
    expect(storeWallet.balance + captainWallet.balance).toBe(105);
  });

  it('increments an existing store wallet and honours its commission rate', async () => {
    h.state.wallets.push({ id: 'store-wallet', userId: null, storeId: 'store-1', balance: 200, commissionRate: '0.15' });

    await creditDeliveredOrder(tx, order);

    const storeWallet = h.state.wallets.find(w => w.storeId === 'store-1')!;
    expect(storeWallet.balance).toBe(285); // 200 + (100 − 15)
    expect(h.state.ledgerEntries[1]).toMatchObject({
      walletId: 'store-wallet',
      type: LedgerEntryType.COMMISSION,
    });
    expect(h.state.ledgerEntries[1].amount.toNumber()).toBe(-15);
  });

  it('skips the captain entirely when there is no delivery fee', async () => {
    await creditDeliveredOrder(tx, { ...order, captainId: 'captain-1', deliveryFee: '0.00' });

    expect(h.state.wallets.some(w => w.userId === 'captain-1')).toBe(false);
    expect(h.state.ledgerEntries).toHaveLength(2);
  });

  it('skips the captain when the order has none assigned', async () => {
    await creditDeliveredOrder(tx, { ...order, captainId: null, deliveryFee: '15.00' });

    expect(h.state.wallets.some(w => w.userId === 'captain-1')).toBe(false);
    expect(h.state.ledgerEntries).toHaveLength(2);
  });
});

describe('creditWallet — admin manual top-up', () => {
  it('404 when the wallet does not exist — nothing is written', async () => {
    (prisma.wallet.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(creditWallet('nope', { amount: 10 })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('422 when the amount is not positive', async () => {
    await expect(creditWallet('wallet-1', { amount: -5 })).rejects.toMatchObject({
      statusCode: 422,
      code: 'VALIDATION_ERROR',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('credits the balance and writes an ADJUSTMENT ledger entry atomically', async () => {
    const result = await creditWallet('wallet-1', { amount: 20, note: 'Top-up' });

    expect(result).toEqual({ balance: 70 });
    expect(h.state.ledgerEntries).toHaveLength(1);
    expect(h.state.ledgerEntries[0]).toMatchObject({
      walletId: 'wallet-1',
      type: LedgerEntryType.ADJUSTMENT,
      description: 'Top-up',
    });
    expect(h.state.ledgerEntries[0].amount.toNumber()).toBe(20);
    expect(h.state.wallets.find(w => w.id === 'wallet-1')!.balance).toBe(70);
  });

  it('defaults the ledger description when no note is given', async () => {
    await creditWallet('wallet-1', { amount: 10 });

    expect(h.state.ledgerEntries[0]).toMatchObject({
      type: LedgerEntryType.ADJUSTMENT,
      description: 'تعديل رصيد يدوي / Manual wallet adjustment',
    });
  });
});
