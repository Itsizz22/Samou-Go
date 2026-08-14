import type { Prisma, PrismaClient } from '../../lib/prisma-types';
import {
  OrderStatus,
  PaymentMethod,
  UserRole,
  calculateOrderTotals,
  calculateVoucherDiscount,
  canRoleSetOrderStatus,
  canTransitionOrderStatus,
  deliveryFeeLabel,
  isTerminalOrderStatus,
  lineTotal,
  roundMoney,
  ORDER_STATUS_LABELS,
} from '@samou-go/shared-types';
import type { OrderDetail, OrderQuote, OrderSummary, Paginated, ReorderResult } from '@samou-go/shared-types';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { badState, conflict, forbidden, notFound, unprocessable } from '../../lib/http-error';
import { formatOrderNumber, startOfDay } from '../../lib/order-number';
import { toOrderDetail, toOrderSummary } from './orders.mapper';
import { toProduct } from '../stores/stores.mapper';
import { creditDeliveredOrder } from '../platform/platform.service';
import type {
  AssignCaptainBody,
  CreateOrderBody,
  OrderListQuery,
  QuoteOrderBody,
  UpdateOrderStatusBody,
} from './orders.schemas';

/** The relation graph `toOrderDetail` expects. */
export const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  customer: true,
  store: true,
  captain: true,
  voucher: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

export const SUMMARY_INCLUDE = {
  items: {
    select: {
      quantity: true,
      note: true,
      product: { select: { nameAr: true } },
    },
  },
  store: { select: { nameAr: true } },
} satisfies Prisma.OrderInclude;

/** Same-day sequence bumps happen atomically via `dailyOrderSequence` upsert. */

/**
 * A database handle that can either be the process-wide Prisma client or an
 * interactive-transaction client. `priceBasket` and `resolveVoucher` accept
 * this so order creation can run the whole validation + pricing + write
 * pipeline against a single transaction.
 */
type OrderDb = Prisma.TransactionClient | PrismaClient;

interface PricedLine {
  productId: string;
  quantity: number;
  unitPrice: number;
}

/** A voucher validated for use on a specific basket, with its discount computed. */
interface ResolvedVoucher {
  id: string;
  code: string;
  labelAr: string;
  labelEn: string;
  discount: number;
  /** For the atomic usage-limit guard inside the order transaction. */
  usageLimit: number | null;
}

/**
 * Resolves a voucher CODE against the DB and computes its savings for this
 * basket. The client only ever sends a code — all money math happens here.
 * Throws a 422 with a machine-readable code when the voucher cannot be used.
 */
async function resolveVoucher(db: OrderDb, code: string, subtotal: number): Promise<ResolvedVoucher> {
  const voucher = await db.voucher.findUnique({ where: { code: code.toUpperCase() } });
  if (!voucher) {
    throw unprocessable('VOUCHER_NOT_FOUND', 'كوبون غير صالح / Invalid voucher code');
  }
  if (!voucher.isActive) {
    throw unprocessable('VOUCHER_INACTIVE', 'كوبون معطّل / This voucher is inactive');
  }
  const now = new Date();
  if (voucher.startsAt && now < voucher.startsAt) {
    throw unprocessable('VOUCHER_NOT_STARTED', 'كوبون لم يبدأ بعد / This voucher is not active yet');
  }
  if (voucher.expiresAt && now > voucher.expiresAt) {
    throw unprocessable('VOUCHER_EXPIRED', 'كوبون منتهي الصلاحية / This voucher has expired');
  }
  if (voucher.usageLimit !== null && voucher.usedCount >= voucher.usageLimit) {
    throw unprocessable(
      'VOUCHER_USAGE_LIMIT',
      'استُخدم هذا الكوبون بالكامل / This voucher has been fully redeemed'
    );
  }

  const discount = calculateVoucherDiscount(subtotal, {
    type: voucher.discountType,
    value: Number(voucher.discountValue),
    minSubtotal: voucher.minSubtotal === null ? undefined : Number(voucher.minSubtotal),
    maxDiscount: voucher.maxDiscount === null ? undefined : Number(voucher.maxDiscount),
  });

  if (discount <= 0) {
    throw unprocessable(
      'VOUCHER_MIN_SUBTOTAL',
      'المبلغ لا يؤهل لهذا الكوبون / Basket does not qualify for this voucher'
    );
  }

  return {
    id: voucher.id,
    code: voucher.code,
    labelAr: voucher.labelAr,
    labelEn: voucher.labelEn,
    discount,
    usageLimit: voucher.usageLimit,
  };
}

/**
 * Turns a client basket into server-priced lines.
 *
 * This is the security boundary for money: prices come from the `products`
 * table, never from the request. Duplicate `productId`s are merged because
 * `OrderItem` is unique on `(orderId, productId)`. The `storeId` scoping means
 * a foreign product id can never be priced from another store.
 */
async function priceBasket(
  db: OrderDb,
  storeId: string,
  items: readonly { productId: string; quantity: number }[]
): Promise<PricedLine[]> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, isActive: true },
  });
  if (!store) throw notFound('المتجر غير موجود / Store not found');
  if (!store.isActive) {
    throw unprocessable('STORE_CLOSED', 'المتجر مغلق حالياً / This store is currently closed');
  }

  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }

  const products = await db.product.findMany({
    where: { id: { in: [...merged.keys()] }, storeId },
    select: { id: true, nameAr: true, price: true, isAvailable: true },
  });

  const byId = new Map(products.map(product => [product.id, product]));

  const lines: PricedLine[] = [];
  for (const [productId, quantity] of merged) {
    const product = byId.get(productId);
    if (!product) {
      throw unprocessable(
        'PRODUCT_NOT_IN_STORE',
        `منتج غير متوفر في هذا المتجر / Product not in this store: ${productId}`
      );
    }
    if (!product.isAvailable) {
      throw unprocessable(
        'PRODUCT_UNAVAILABLE',
        `المنتج غير متاح حالياً / Currently unavailable: ${product.nameAr}`
      );
    }
    lines.push({ productId, quantity, unitPrice: Number(product.price) });
  }

  return lines;
}

/**
 * POST /orders/quote — the checkout screen calls this to show the delivery fee
 * before the customer commits. Same arithmetic as `createOrder`, no writes.
 */
export async function quoteOrder(body: QuoteOrderBody): Promise<OrderQuote> {
  const lines = await priceBasket(prisma, body.storeId, body.items);
  const totals = calculateOrderTotals(lines, env.deliveryFeeConfig, body.deliveryRegion);

  if (totals.subtotal <= 0) {
    throw unprocessable('EMPTY_BASKET', 'السلة فارغة / The basket is empty');
  }

  let voucher: ResolvedVoucher | null = null;
  if (body.voucherCode) {
    voucher = await resolveVoucher(prisma, body.voucherCode, totals.subtotal);
  }

  const discount = voucher?.discount ?? 0;

  return {
    ...totals,
    discount,
    totalAmount: roundMoney(totals.totalAmount - discount),
    currency: env.deliveryFeeConfig.currency,
    deliveryFeeLabel: deliveryFeeLabel('both'),
    voucher: voucher
      ? {
          code: voucher.code,
          labelAr: voucher.labelAr,
          labelEn: voucher.labelEn,
          discount: voucher.discount,
        }
      : null,
  };
}

export async function createOrder(
  customerId: string,
  body: CreateOrderBody
): Promise<OrderDetail> {
  return prisma.$transaction(async tx => {
    // Everything below is inside ONE transaction:
    //   price the basket from the DB (authoritative), validate availability,
    //   resolve the voucher, then write order + items + status history.
    // If any step throws, the whole unit rolls back — no order, no items,
    // no voucher redemption, no partial financials.
    const lines = await priceBasket(tx, body.storeId, body.items);
    const totals = calculateOrderTotals(lines, env.deliveryFeeConfig, body.deliveryRegion);

    if (totals.subtotal <= 0) {
      throw unprocessable('EMPTY_BASKET', 'السلة فارغة / The basket is empty');
    }

    const voucher = body.voucherCode
      ? await resolveVoucher(tx, body.voucherCode, totals.subtotal)
      : null;
    const discount = voucher?.discount ?? 0;

    const now = new Date();

    // Mint the next per-day order number ATOMICALLY. `upsert` + `increment`
    // locks the `daily_order_sequences` row for this day inside this
    // transaction, so two concurrent orders can never observe the same
    // counter — unlike the old `COUNT(*)` + retry loop. A rollback undoes
    // the bump too, leaving (harmless) gaps in the number sequence.
    const sequence = await tx.dailyOrderSequence.upsert({
      where: { date: startOfDay(now) },
      update: { sequence: { increment: 1 } },
      create: { date: startOfDay(now), sequence: 1 },
    });

    // Atomically redeem the voucher. A used-up voucher bumps a row that
    // was previously reserved by another order → count stays 0, throw.
    if (voucher) {
      if (voucher.usageLimit === null) {
        await tx.voucher.update({
          where: { id: voucher.id },
          data: { usedCount: { increment: 1 } },
        });
      } else {
        const redeemed = await tx.voucher.updateMany({
          where: { id: voucher.id, usedCount: { lt: voucher.usageLimit } },
          data: { usedCount: { increment: 1 } },
        });
        if (redeemed.count === 0) {
          throw unprocessable(
            'VOUCHER_USAGE_LIMIT',
            'استُخدم هذا الكوبون بالكامل / This voucher has been fully redeemed'
          );
        }
      }
    }

    const order = await tx.order.create({
      data: {
        orderNumber: formatOrderNumber(now, sequence.sequence),
        customerId,
        storeId: body.storeId,
        status: OrderStatus.PENDING,
        customerAddressText: body.customerAddressText,
        addressNote: body.addressNote ?? null,
        orderNote: body.orderNote ?? null,
        subtotal: totals.subtotal,
        deliveryFee: totals.deliveryFee,
        discount,
        totalAmount: roundMoney(totals.totalAmount - discount),
        voucherId: voucher?.id ?? null,
        paymentMethod: PaymentMethod.COD,
        items: {
          create: lines.map(line => {
            const itemSource = body.items.find((it: CreateOrderBody['items'][number]) => it.productId === line.productId);
            return {
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalPrice: lineTotal(line.unitPrice, line.quantity),
              note: itemSource?.note ?? null,
              // Append modifier summary to note if present, for display in order detail
              ...(itemSource?.modifiers
                ? itemSource?.note
                  ? { note: `${itemSource.note} | ${modifierSummary(itemSource.modifiers)}` }
                  : { note: modifierSummary(itemSource.modifiers) }
                : {}),
            };
          }),
        },
        statusHistory: {
          create: {
            status: OrderStatus.PENDING,
            changedByUserId: customerId,
            note: 'تم إنشاء الطلب / Order created',
          },
        },
      },
      include: DETAIL_INCLUDE,
    });

    return toOrderDetail(order);
  });
}

/** Reduce modifier groups to a short Arabic/English summary string. */
function modifierSummary(modifiers: readonly { labelAr: string; labelEn: string; options: readonly { key: string; labelAr: string; labelEn: string }[] }[]): string {
  const parts: string[] = [];
  for (const group of modifiers) {
    // Every selected option is shown, not just the first — a "chicken + cheese
    // + salad" sandwich would otherwise read as just "chicken".
    for (const option of group.options) {
      parts.push(option.labelAr);
    }
  }
  return parts.join(' / ') || 'مخصص';
}

/* ---------------------------------------------------------------------------
 * Reading — every query is scoped to what the caller's role may see
 * ------------------------------------------------------------------------- */

async function storeIdsManagedBy(userId: string): Promise<string[]> {
  const stores = await prisma.store.findMany({ where: { managerId: userId }, select: { id: true } });
  return stores.map(store => store.id);
}

async function visibilityScope(
  actor: { sub: string; role: UserRole }
): Promise<Prisma.OrderWhereInput> {
  switch (actor.role) {
    case UserRole.CUSTOMER:
      return { customerId: actor.sub };
    case UserRole.STORE_MANAGER:
      return { storeId: { in: await storeIdsManagedBy(actor.sub) } };
    case UserRole.CAPTAIN:
      // Own jobs, plus the unclaimed pool a captain is allowed to pick from.
      return {
        OR: [
          { captainId: actor.sub },
          { captainId: null, status: { in: [OrderStatus.READY_FOR_PICKUP] }, store: { dedicatedCaptains: { none: {} } } },
          { captainId: null, status: { in: [OrderStatus.READY_FOR_PICKUP] }, store: { dedicatedCaptains: { some: { id: actor.sub } } } },
        ],
      };
    case UserRole.ADMIN:
      return {};
    default:
      return { id: '__no_match__' };
  }
}

export async function listOrders(
  actor: { sub: string; role: UserRole },
  query: OrderListQuery
): Promise<Paginated<OrderSummary>> {
  const where: Prisma.OrderWhereInput = {
    AND: [
      await visibilityScope(actor),
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.storeId ? { storeId: query.storeId } : {}),
        ...(query.captainId ? { captainId: query.captainId } : {}),
      },
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: SUMMARY_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items: rows.map(toOrderSummary),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

export async function loadOrderOrThrow(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: DETAIL_INCLUDE,
  });
  if (!order) throw notFound('الطلب غير موجود / Order not found');
  return order;
}

export async function assertCanView(
  order: { customerId: string; storeId: string; captainId: string | null; status: OrderStatus },
  actor: { sub: string; role: UserRole }
): Promise<void> {
  switch (actor.role) {
    case UserRole.ADMIN:
      return;
    case UserRole.CUSTOMER:
      if (order.customerId === actor.sub) return;
      break;
    case UserRole.STORE_MANAGER:
      if ((await storeIdsManagedBy(actor.sub)).includes(order.storeId)) return;
      break;
    case UserRole.CAPTAIN:
      if (order.captainId === actor.sub) return;
      if (order.captainId === null && order.status === OrderStatus.READY_FOR_PICKUP) return;
      break;
    default:
      break;
  }
  throw forbidden('لا تملك صلاحية لعرض هذا الطلب / You may not view this order');
}

export async function getOrder(
  actor: { sub: string; role: UserRole },
  orderId: string
): Promise<OrderDetail> {
  const order = await loadOrderOrThrow(orderId);
  await assertCanView(order, actor);
  return toOrderDetail(order);
}

/**
 * Re-order — hands the client a ready-made basket from a past order, priced
 * with the products' CURRENT prices. Products that are no longer available
 * are skipped, and the count is reported so the UI can warn the customer.
 */
export async function reorderOrder(
  actor: { sub: string; role: UserRole },
  orderId: string
): Promise<ReorderResult> {
  const order = await loadOrderOrThrow(orderId);
  await assertCanView(order, actor);

  const currentProducts = await prisma.product.findMany({
    where: { id: { in: order.items.map(item => item.productId) } },
  });
  const byId = new Map(currentProducts.map(product => [product.id, product]));

  let skipped = 0;
  const items: ReorderResult['items'] = [];
  for (const item of order.items) {
    const product = byId.get(item.productId);
    if (!product || !product.isAvailable) {
      skipped += 1;
      continue;
    }
    items.push({ product: toProduct(product), quantity: item.quantity, ...(item.note ? { note: item.note } : {}) });
  }

  return {
    storeId: order.storeId,
    storeNameAr: order.store.nameAr,
    items,
    skipped,
  };
}

/* ---------------------------------------------------------------------------
 * Status transitions
 * ------------------------------------------------------------------------- */

/**
 * Three independent gates, all of which must pass:
 *   1. the state machine allows `current → next` (shared-types)
 *   2. the caller's ROLE is an actor for `next` (shared-types)
 *   3. the caller actually owns this particular order (checked here)
 */
export async function updateOrderStatus(
  actor: { sub: string; role: UserRole },
  orderId: string,
  body: UpdateOrderStatusBody
): Promise<OrderDetail> {
  const order = await loadOrderOrThrow(orderId);
  await assertCanView(order, actor);

  const current = order.status;
  const next = body.status;

  if (current === next) {
    throw badState(
      'STATUS_UNCHANGED',
      `الطلب بالفعل في حالة "${ORDER_STATUS_LABELS[next as OrderStatus].ar}" / Order is already ${ORDER_STATUS_LABELS[next as OrderStatus].en}`
    );
  }

  if (isTerminalOrderStatus(current)) {
    throw badState(
      'ORDER_CLOSED',
      `الطلب مُغلق (${ORDER_STATUS_LABELS[current as OrderStatus].ar}) ولا يمكن تعديله / Order is closed and cannot change`
    );
  }

  if (!canTransitionOrderStatus(current, next)) {
    throw badState(
      'ILLEGAL_TRANSITION',
      `لا يمكن الانتقال من "${ORDER_STATUS_LABELS[current as OrderStatus].ar}" إلى "${ORDER_STATUS_LABELS[next as OrderStatus].ar}" / Illegal transition ${current} → ${next}`
    );
  }

  if (!canRoleSetOrderStatus(actor.role, next)) {
    throw forbidden(
      `دورك لا يسمح بتعيين هذه الحالة / Your role may not set status ${next}`
    );
  }

  if (body.estimatedPrepMinutes !== undefined &&
    (actor.role !== UserRole.STORE_MANAGER || current !== OrderStatus.PENDING || next !== OrderStatus.ACCEPTED)) {
    throw badState('PREP_ESTIMATE_NOT_ALLOWED', 'مدة التحضير تُحدَّد عند قبول المتجر للطلب فقط / Prep time is set only when the store accepts an order');
  }

  // Ownership rules that the generic role table cannot express.
  if (actor.role === UserRole.CUSTOMER) {
    if (order.customerId !== actor.sub) {
      throw forbidden('هذا ليس طلبك / Not your order');
    }
    // A customer may pull out only before the shop starts cooking.
    if (current !== OrderStatus.PENDING && current !== OrderStatus.ACCEPTED) {
      throw badState(
        'CANCEL_WINDOW_CLOSED',
        'لا يمكن الإلغاء بعد بدء التحضير / Cannot cancel once preparation has started'
      );
    }
  }

  // Claiming an unassigned job by moving it to ON_THE_WAY assigns it to them.
  const isClaimAttempt =
    actor.role === UserRole.CAPTAIN &&
    order.captainId === null &&
    next === OrderStatus.ON_THE_WAY;

  if (actor.role === UserRole.CAPTAIN) {
    if (order.captainId !== actor.sub && !isClaimAttempt) {
      throw forbidden('الطلب غير مُسند إليك / This order is not assigned to you');
    }
  }

  // Claiming requires a live, verified, available captain — the whole point of
  // the admin verification gate. Checked only on the claim edge, so a captain
  // already delivering can still finish their own job while offline.
  if (isClaimAttempt) {
    const captain = await prisma.user.findUnique({
      where: { id: actor.sub },
      select: { id: true, isActive: true, isVerified: true, isAvailable: true, assignedStoreId: true },
    });
    if (!captain || !captain.isActive) {
      throw unprocessable(
        'CAPTAIN_INACTIVE',
        'حساب الكابتن موقوف / Captain account is inactive'
      );
    }
    if (!captain.isVerified) {
      throw unprocessable(
        'CAPTAIN_UNVERIFIED',
        'لم يتم توثيق حسابك بعد — تواصل مع المشرف / Your account is not verified yet — contact an admin'
      );
    }
    if (!captain.isAvailable) {
      throw unprocessable(
        'CAPTAIN_OFFLINE',
        'ضع حالتك على "متاح" لاستقبال الطلبات / Set your status to Available before accepting orders'
      );
    }
    if (captain.assignedStoreId !== null && captain.assignedStoreId !== order.storeId) {
      throw forbidden('هذا الطلب مخصص لمتجر آخر / This order belongs to another store');
    }
  }

  const assignCaptainOnClaim = isClaimAttempt;

  let updated;
  try {
    updated = await prisma.$transaction(async tx => {
      const result = await tx.order.update({
        where: {
          id: orderId,
          // Optimistic lock on the CURRENT status, not just the id. Every
          // state-machine gate above ran against the `order` we read, but two
          // concurrent transitions could both read the same old status and both
          // pass those gates. Filtering the write on `status: current` means the
          // loser matches zero rows → Prisma throws P2025 → we surface a 409,
          // so a stale writer can never silently overwrite a transition that
          // already committed (e.g. customer cancels while the store accepts).
          status: current,
          // Optimistic lock for captain claim: if another captain already
          // claimed this order between our read and this write, Prisma will
          // throw P2025 (record not found for the filter) and we surface a
          // 409 instead of silently overwriting the first captain's assignment.
          ...(assignCaptainOnClaim ? { captainId: null } : {}),
        },
        data: {
          status: next,
          ...(body.estimatedPrepMinutes !== undefined ? { estimatedPrepMinutes: body.estimatedPrepMinutes } : {}),
          ...(assignCaptainOnClaim ? { captainId: actor.sub } : {}),
          statusHistory: {
            create: {
              status: next,
              changedByUserId: actor.sub,
              note: body.note ?? null,
            },
          },
        },
        include: DETAIL_INCLUDE,
      });

      // The moment the money lands. DELIVERED is terminal and the optimistic
      // lock above guarantees exactly one transition commits, so crediting the
      // store + captain wallets here (with their ledger entries) happens exactly
      // once — never on a stale, lost race. If any credit write fails, the
      // whole unit rolls back including the status change.
      if (next === OrderStatus.DELIVERED) {
        await creditDeliveredOrder(tx, {
          storeId: order.storeId,
          captainId: order.captainId,
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          orderNumber: order.orderNumber,
        });
      }

      return result;
    });
  } catch (err) {
    // P2025 means our optimistic filter no longer matched — the order moved
    // underneath us between validation and write.
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: string }).code === 'P2025'
    ) {
      if (assignCaptainOnClaim) {
        throw conflict(
          'الطلب مُسند لكابتن آخر / This order was just claimed by another captain'
        );
      }
      throw conflict(
        'تغيّرت حالة الطلب في هذه الأثناء — حدّث الصفحة وحاول مجدداً / Order status changed concurrently — refresh and retry'
      );
    }
    throw err;
  }

  return toOrderDetail(updated);
}

/** Admin (or a store manager for their own shop) hands a job to a captain. */
export async function assignCaptain(
  actor: { sub: string; role: UserRole },
  orderId: string,
  body: AssignCaptainBody
): Promise<OrderDetail> {
  const order = await loadOrderOrThrow(orderId);

  if (actor.role === UserRole.STORE_MANAGER) {
    if (!(await storeIdsManagedBy(actor.sub)).includes(order.storeId)) {
      throw forbidden('الطلب ليس من متجرك / This order is not from your store');
    }
  } else if (actor.role !== UserRole.ADMIN) {
    throw forbidden();
  }

  if (isTerminalOrderStatus(order.status)) {
    throw badState('ORDER_CLOSED', 'الطلب مُغلق / Order is closed');
  }

  const captain = await prisma.user.findUnique({
    where: { id: body.captainId },
    select: { id: true, role: true, isActive: true, isVerified: true, assignedStoreId: true },
  });

  if (!captain || captain.role !== UserRole.CAPTAIN) {
    throw unprocessable('NOT_A_CAPTAIN', 'المستخدم ليس كابتن توصيل / User is not a captain');
  }
  if (!captain.isActive) {
    throw unprocessable('CAPTAIN_INACTIVE', 'حساب الكابتن موقوف / Captain account is inactive');
  }
  if (!captain.isVerified) {
    throw unprocessable(
      'CAPTAIN_UNVERIFIED',
      'الكابتن غير موثّق بعد — وثّق الحساب أولاً / Captain is not verified yet — verify the account first'
    );
  }
  if (captain.assignedStoreId !== null && captain.assignedStoreId !== order.storeId) {
    throw unprocessable('CAPTAIN_STORE_MISMATCH', 'الكابتن مخصص لمتجر آخر / Captain is dedicated to another store');
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      captainId: captain.id,
      statusHistory: {
        create: {
          status: order.status,
          changedByUserId: actor.sub,
          note: `تم إسناد الطلب للكابتن / Assigned to captain ${captain.id}`,
        },
      },
    },
    include: DETAIL_INCLUDE,
  });

  return toOrderDetail(updated);
}