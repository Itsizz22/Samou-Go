import { LedgerEntryType, SettlementMethod, UserRole } from '@samou-go/shared-types';
import type { JwtPayload } from '@samou-go/shared-types';
import type { Prisma } from '../../lib/prisma-types';
import { prisma } from '../../lib/prisma';
import { Prisma as PrismaRuntime } from '../../lib/prisma-runtime';
import { badRequest, forbidden, notFound } from '../../lib/http-error';
import { decimalToNumber } from '../../lib/decimal';
import { parseWith } from '../../lib/validate';
import { isOrderPartyMember } from '../../lib/order-party';
import type {
  LocationBody,
  PlatformSettingsBody,
  RatingBody,
  SettlementBody,
  TicketBody,
  WalletCreditBody,
} from './platform.schemas';
import { chatSchema, ratingSchema, settlementSchema, walletCreditSchema } from './platform.schemas';

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

export async function listOrderChat(orderId: string, auth: JwtPayload) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, captainId: true, store: { select: { managerId: true } } },
  });
  if (!order || !isOrderPartyMember(auth, order)) throw forbidden();
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
  if (!order || !isOrderPartyMember(auth, order)) throw forbidden();
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
 * Reads the platform settings singleton, defaulting every knob when the row
 * has not been provisioned yet. Money fields are returned as plain numbers.
 */
export async function getPlatformSettings() {
  const row =
    (await prisma.platformSettings.findUnique({ where: { id: 'platform' } })) ??
    (await prisma.platformSettings.create({
      data: { id: 'platform' },
    }));
  return {
    id: row.id,
    captainDeliveryRate: decimalToNumber(row.captainDeliveryRate),
    storeCommissionRate: decimalToNumber(row.storeCommissionRate),
    autoAssign: row.autoAssign,
    isDriverDynamicFeeEnabled: row.isDriverDynamicFeeEnabled,
    requireOtpForSensitiveActions: row.requireOtpForSensitiveActions,
    whatsappSupportNumber: row.whatsappSupportNumber ?? null,
    updatedAt: row.updatedAt,
  };
}

/** PATCH — admin updates one or more knobs on the singleton row. */
export async function updatePlatformSettings(body: PlatformSettingsBody) {
  const row = await prisma.platformSettings.upsert({
    where: { id: 'platform' },
    create: {
      id: 'platform',
      ...(body.captainDeliveryRate !== undefined ? { captainDeliveryRate: body.captainDeliveryRate } : {}),
      ...(body.storeCommissionRate !== undefined ? { storeCommissionRate: body.storeCommissionRate } : {}),
      ...(body.autoAssign !== undefined ? { autoAssign: body.autoAssign } : {}),
      ...(body.isDriverDynamicFeeEnabled !== undefined ? { isDriverDynamicFeeEnabled: body.isDriverDynamicFeeEnabled } : {}),
      ...(body.requireOtpForSensitiveActions !== undefined ? { requireOtpForSensitiveActions: body.requireOtpForSensitiveActions } : {}),
      ...(body.whatsappSupportNumber !== undefined && body.whatsappSupportNumber !== null ? { whatsappSupportNumber: body.whatsappSupportNumber } : {}),
    },
    update: {
      ...(body.captainDeliveryRate !== undefined ? { captainDeliveryRate: body.captainDeliveryRate } : {}),
      ...(body.storeCommissionRate !== undefined ? { storeCommissionRate: body.storeCommissionRate } : {}),
      ...(body.autoAssign !== undefined ? { autoAssign: body.autoAssign } : {}),
      ...(body.isDriverDynamicFeeEnabled !== undefined ? { isDriverDynamicFeeEnabled: body.isDriverDynamicFeeEnabled } : {}),
      ...(body.requireOtpForSensitiveActions !== undefined ? { requireOtpForSensitiveActions: body.requireOtpForSensitiveActions } : {}),
      ...(body.whatsappSupportNumber !== undefined ? { whatsappSupportNumber: body.whatsappSupportNumber ?? undefined } : {}),
    },
  });
  return {
    id: row.id,
    captainDeliveryRate: decimalToNumber(row.captainDeliveryRate),
    storeCommissionRate: decimalToNumber(row.storeCommissionRate),
    autoAssign: row.autoAssign,
    isDriverDynamicFeeEnabled: row.isDriverDynamicFeeEnabled,
    requireOtpForSensitiveActions: row.requireOtpForSensitiveActions,
    whatsappSupportNumber: row.whatsappSupportNumber ?? null,
    updatedAt: row.updatedAt,
  };
}

/* ---------------------------------------------------------------------------
 * Wallet credits — P0-2: every balance mutation carries a LedgerEntry in the
 * SAME transaction, and every mutation is an atomic increment/decrement (never
 * read-then-write), so concurrent writers can never corrupt a balance.
 * ------------------------------------------------------------------------- */

/** The money split for one delivered order. All Decimal — never float. */
export interface OrderFinancials {
  /** Order subtotal (gross, before commission). */
  gross: Prisma.Decimal;
  /** `gross × wallet.commissionRate`, rounded half-up to 2dp. */
  commission: Prisma.Decimal;
  /** `gross − commission` — what lands in the store wallet. */
  storeNet: Prisma.Decimal;
  /** `deliveryFee + captainDeliveryRate` — what lands in the captain wallet. */
  captainPayout: Prisma.Decimal;
}

export function computeOrderFinancials(
  subtotal: Prisma.Decimal | number | string,
  deliveryFee: Prisma.Decimal | number | string,
  commissionRate: Prisma.Decimal | number | string,
  captainDeliveryRate: Prisma.Decimal | number | string = 0
): OrderFinancials {
  const gross = new PrismaRuntime.Decimal(subtotal);
  const commission = gross
    .mul(new PrismaRuntime.Decimal(commissionRate))
    .toDecimalPlaces(2, PrismaRuntime.Decimal.ROUND_HALF_UP);
  return {
    gross,
    commission,
    storeNet: gross.minus(commission),
    captainPayout: new PrismaRuntime.Decimal(deliveryFee).plus(
      new PrismaRuntime.Decimal(captainDeliveryRate)
    ),
  };
}

/**
 * Credits both wallets for a delivered order, atomically, inside the caller's
 * transaction — the balance increment/upsert and the LedgerEntry rows commit or
 * roll back together with the DELIVERED status change. The store wallet is
 * upserted by `storeId` and the captain wallet by `userId`, so lazy creation of
 * a missing wallet and concurrent orders on the same wallet are both safe.
 * A zero (or missing) captain accrues no payout and writes no rows.
 */
export async function creditDeliveredOrder(
  tx: Prisma.TransactionClient,
  order: {
    storeId: string;
    captainId: string | null;
    subtotal: Prisma.Decimal | number | string;
    deliveryFee: Prisma.Decimal | number | string;
    orderNumber: string;
  }
): Promise<void> {
  const existingStoreWallet = await tx.wallet.findUnique({
    where: { storeId: order.storeId },
    select: { commissionRate: true },
  });
  // Platform-wide knobs: the store wallet's own rate always wins over the
  // global default; the captain flat rate adds on top of the delivery fee.
  // Defensive access so a fixture without the settings client degrades to defaults.
  const settings = tx.platformSettings
    ? await tx.platformSettings.findUnique({ where: { id: 'platform' } }).catch(() => null)
    : null;
  const financials = computeOrderFinancials(
    order.subtotal,
    order.deliveryFee,
    existingStoreWallet?.commissionRate ?? settings?.storeCommissionRate ?? '0.10',
    settings?.captainDeliveryRate ?? 0
  );

  const storeWallet = await tx.wallet.upsert({
    where: { storeId: order.storeId },
    update: { balance: { increment: financials.storeNet } },
    create: { storeId: order.storeId, balance: financials.storeNet },
    select: { id: true },
  });

  await tx.ledgerEntry.create({
    data: {
      walletId: storeWallet.id,
      amount: financials.gross,
      type: LedgerEntryType.EARNING,
      description: `أرباح المتجر عن الطلب ${order.orderNumber} / Store earnings for order ${order.orderNumber}`,
    },
  });
  await tx.ledgerEntry.create({
    data: {
      walletId: storeWallet.id,
      amount: financials.commission.negated(),
      type: LedgerEntryType.COMMISSION,
      description: `عمولة المنصة عن الطلب ${order.orderNumber} / Platform commission for order ${order.orderNumber}`,
    },
  });

  if (order.captainId && financials.captainPayout.greaterThan(0)) {
    const captainWallet = await tx.wallet.upsert({
      where: { userId: order.captainId },
      update: { balance: { increment: financials.captainPayout } },
      create: { userId: order.captainId, balance: financials.captainPayout },
      select: { id: true },
    });
    await tx.ledgerEntry.create({
      data: {
        walletId: captainWallet.id,
        amount: financials.captainPayout,
        type: LedgerEntryType.EARNING,
        description: `أرباح التوصيل عن الطلب ${order.orderNumber} / Delivery earnings for order ${order.orderNumber}`,
      },
    });
  }
}

/** Admin manual top-up. Positive-only, atomic, always ledgered. */
export async function creditWallet(
  walletId: string,
  rawBody: unknown
): Promise<{ balance: number }> {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) throw notFound('المحفظة غير موجودة / Wallet not found');
  const body: WalletCreditBody = parseWith(walletCreditSchema, rawBody);
  const amount = new PrismaRuntime.Decimal(body.amount);
  return prisma.$transaction(async tx => {
    const updated = await tx.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: amount } },
    });
    await tx.ledgerEntry.create({
      data: {
        walletId,
        amount,
        type: LedgerEntryType.ADJUSTMENT,
        description: body.note ?? 'تعديل رصيد يدوي / Manual wallet adjustment',
      },
    });
    return { balance: decimalToNumber(updated.balance) };
  });
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
