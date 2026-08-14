import { LedgerEntryType, SettlementMethod, UserRole } from '@samou-go/shared-types';
import type { JwtPayload } from '@samou-go/shared-types';
import type { Prisma } from '../../lib/prisma-types';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/http-error';
import { decimalToNumber } from '../../lib/decimal';
import { parseWith } from '../../lib/validate';
import type {
  LocationBody,
  RatingBody,
  SettlementBody,
  TicketBody,
} from './platform.schemas';
import { chatSchema, ratingSchema, settlementSchema } from './platform.schemas';

/** A settlement row with money already converted to a plain number (DTO shape). */
export interface SettlementRow {
  id: string;
  walletId: string;
  amount: number;
  method: SettlementMethod;
  note: string | null;
  createdAt: Date;
}

export interface SettleResult {
  balance: number;
  settlement: SettlementRow;
}

export async function updateCaptainLocation(captainId: string, body: LocationBody) {
  return prisma.captainLocation.upsert({
    where: { captainId },
    create: { captainId, ...body },
    update: body,
  });
}

export async function getOrderLocation(auth: JwtPayload, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { captainId: true, customerId: true, storeId: true },
  });
  if (!order) throw notFound('الطلب غير موجود / Order not found');
  if (auth.role !== UserRole.ADMIN && auth.sub !== order.customerId && auth.sub !== order.captainId) {
    throw forbidden();
  }
  return order.captainId
    ? prisma.captainLocation.findUnique({ where: { captainId: order.captainId } })
    : null;
}

export async function rateOrder(orderId: string, customerId: string, rawBody: unknown) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, storeId: true, captainId: true, status: true },
  });
  if (!order || order.customerId !== customerId) throw notFound('الطلب غير موجود / Order not found');
  if (order.status !== 'DELIVERED') {
    throw badRequest('يمكن التقييم بعد التسليم فقط / Rating is available after delivery');
  }
  const body = parseWith(ratingSchema, rawBody);
  return prisma.rating.create({
    data: { orderId, customerId, storeId: order.storeId, captainId: order.captainId, ...body },
  });
}

function canSeeOrderChat(
  auth: JwtPayload,
  order: { customerId: string; captainId: string | null; store: { managerId: string } }
): boolean {
  return (
    auth.role === UserRole.ADMIN ||
    [order.customerId, order.captainId, order.store.managerId].includes(auth.sub)
  );
}

export async function listOrderChat(orderId: string, auth: JwtPayload) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, captainId: true, store: { select: { managerId: true } } },
  });
  if (!order || !canSeeOrderChat(auth, order)) throw forbidden();
  return prisma.chatMessage.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
}

export async function sendOrderChat(orderId: string, auth: JwtPayload, rawBody: unknown) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, captainId: true, store: { select: { managerId: true } } },
  });
  if (!order || !canSeeOrderChat(auth, order)) throw forbidden();
  const body = parseWith(chatSchema, rawBody);
  return prisma.chatMessage.create({
    data: { orderId, senderId: auth.sub, senderRole: auth.role, message: body.message },
  });
}

export async function createSupportTicket(auth: JwtPayload, body: TicketBody) {
  return prisma.supportTicket.create({ data: { userId: auth.sub, role: auth.role, ...body } });
}

export async function getWallet(auth: JwtPayload) {
  const wallet = await prisma.wallet.findFirst({
    where:
      auth.role === UserRole.STORE_MANAGER
        ? { store: { managerId: auth.sub } }
        : { userId: auth.sub },
    include: { settlements: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!wallet) return null;
  return {
    ...wallet,
    balance: decimalToNumber(wallet.balance),
    settlements: wallet.settlements.map(s => ({ ...s, amount: decimalToNumber(s.amount) })),
  };
}

export async function getAdminFinancials() {
  const [wallets, settlements, orders] = await Promise.all([
    prisma.wallet.findMany({
      include: { user: { select: { id: true, name: true, role: true } }, store: { select: { id: true, nameAr: true } } },
    }),
    prisma.settlement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.order.aggregate({ _sum: { totalAmount: true }, where: { status: 'DELIVERED' } }),
  ]);
  return {
    revenue: decimalToNumber(orders._sum.totalAmount ?? 0),
    wallets: wallets.map(w => ({ ...w, balance: decimalToNumber(w.balance) })),
    settlements: settlements.map(s => ({ ...s, amount: decimalToNumber(s.amount) })),
  };
}

/**
 * One atomic wallet settlement. `claimSettlement` runs inside the caller's
 * transaction so the balance decrement, settlement row and ledger entry are
 * all-or-nothing. The decrement is a guarded `updateMany` (WHERE balance >=
 * amount) rather than read-then-write, so two concurrent settlements can never
 * both pass a stale balance check and push the wallet negative.
 */
export async function claimSettlement(
  tx: Prisma.TransactionClient,
  walletId: string,
  body: SettlementBody
): Promise<SettleResult> {
  const claimed = await tx.wallet.updateMany({
    where: { id: walletId, balance: { gte: body.amount } },
    data: { balance: { decrement: body.amount } },
  });
  if (claimed.count === 0) {
    throw badRequest('الرصيد غير كافٍ / Insufficient wallet balance');
  }
  const updated = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
  const settlement = await tx.settlement.create({
    data: { walletId, amount: body.amount, method: body.method, note: body.note },
  });
  await tx.ledgerEntry.create({
    data: { walletId, amount: -body.amount, type: LedgerEntryType.SETTLEMENT, description: body.note ?? 'Admin settlement' },
  });
  return {
    balance: decimalToNumber(updated.balance),
    settlement: {
      id: settlement.id,
      walletId: settlement.walletId,
      amount: decimalToNumber(settlement.amount),
      method: settlement.method,
      note: settlement.note,
      createdAt: settlement.createdAt,
    },
  };
}

/** The wallet must exist and the body must be valid before the debit begins. */
export async function settleWallet(walletId: string, rawBody: unknown): Promise<SettleResult> {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) throw notFound('المحفظة غير موجودة / Wallet not found');
  const body = parseWith(settlementSchema, rawBody);
  return prisma.$transaction(tx => claimSettlement(tx, wallet.id, body));
}
