import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerEntryType, SettlementMethod, UserRole } from '@samou-go/shared-types';
import type { Prisma } from '../../lib/prisma-types';
import { HttpError } from '../../lib/http-error';
import { claimSettlement, rateOrder, sendOrderChat, settleWallet } from './platform.service';

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
    settlements: [] as unknown[],
    ledgerEntries: [] as unknown[],
    order: null as Record<string, unknown> | null,
  };

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

import { prisma } from '../../lib/prisma';

beforeEach(() => {
  h.state.balance = 50;
  h.state.settlements = [];
  h.state.ledgerEntries = [];
  h.state.order = null;
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
