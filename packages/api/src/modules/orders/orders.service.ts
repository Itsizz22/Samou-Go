import type { Prisma } from '@prisma/client';
import {
  OrderStatus,
  PaymentMethod,
  UserRole,
  calculateOrderTotals,
  canRoleSetOrderStatus,
  canTransitionOrderStatus,
  deliveryFeeLabel,
  isTerminalOrderStatus,
  lineTotal,
  ORDER_STATUS_LABELS,
} from '@samou-go/shared-types';
import type { OrderDetail, OrderQuote, OrderSummary, Paginated } from '@samou-go/shared-types';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/http-error';
import { formatOrderNumber, startOfDay, startOfNextDay } from '../../lib/order-number';
import { toOrderDetail, toOrderSummary } from './orders.mapper';
import type {
  AssignCaptainBody,
  CreateOrderBody,
  OrderListQuery,
  QuoteOrderBody,
  UpdateOrderStatusBody,
} from './orders.schemas';

/** The relation graph `toOrderDetail` expects. */
const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  customer: true,
  store: true,
  captain: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

const SUMMARY_INCLUDE = {
  items: { select: { quantity: true } },
  store: { select: { nameAr: true } },
} satisfies Prisma.OrderInclude;

/** Same-day sequence collisions under concurrency; retry a few times. */
const ORDER_NUMBER_ATTEMPTS = 5;

interface PricedLine {
  productId: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Turns a client basket into server-priced lines.
 *
 * This is the security boundary for money: prices come from the `products`
 * table, never from the request. Duplicate `productId`s are merged because
 * `OrderItem` is unique on `(orderId, productId)`.
 */
async function priceBasket(
  storeId: string,
  items: readonly { productId: string; quantity: number }[]
): Promise<PricedLine[]> {
  const store = await prisma.store.findUnique({
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

  const products = await prisma.product.findMany({
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
  const lines = await priceBasket(body.storeId, body.items);
  const totals = calculateOrderTotals(lines, env.deliveryFeeConfig);

  return {
    ...totals,
    currency: env.deliveryFeeConfig.currency,
    deliveryFeeLabel: deliveryFeeLabel('both'),
  };
}

export async function createOrder(
  customerId: string,
  body: CreateOrderBody
): Promise<OrderDetail> {
  const lines = await priceBasket(body.storeId, body.items);
  const totals = calculateOrderTotals(lines, env.deliveryFeeConfig);

  for (let attempt = 0; attempt < ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async tx => {
        const now = new Date();
        const todaySoFar = await tx.order.count({
          where: { createdAt: { gte: startOfDay(now), lt: startOfNextDay(now) } },
        });

        const order = await tx.order.create({
          data: {
            orderNumber: formatOrderNumber(now, todaySoFar + 1 + attempt),
            customerId,
            storeId: body.storeId,
            status: OrderStatus.PENDING,
            customerAddressText: body.customerAddressText,
            addressNote: body.addressNote ?? null,
            subtotal: totals.subtotal,
            deliveryFee: totals.deliveryFee,
            totalAmount: totals.totalAmount,
            paymentMethod: PaymentMethod.COD,
            items: {
              create: lines.map(line => ({
                productId: line.productId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                totalPrice: lineTotal(line.unitPrice, line.quantity),
              })),
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
    } catch (error) {
      const isLastAttempt = attempt === ORDER_NUMBER_ATTEMPTS - 1;
      if (isOrderNumberCollision(error) && !isLastAttempt) continue;
      throw error;
    }
  }

  throw conflict('تعذّر توليد رقم طلب فريد / Could not allocate a unique order number');
}

function isOrderNumberCollision(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== 'P2002') return false;
  const target = candidate.meta?.target;
  // Only retry when the collision is specifically on orderNumber.
  // Returning true for an unknown target would swallow unrelated P2002s
  // (e.g. a productId unique violation inside the same transaction).
  return Array.isArray(target) && target.includes('orderNumber');
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
          { captainId: null, status: { in: [OrderStatus.READY_FOR_PICKUP] } },
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

async function loadOrderOrThrow(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: DETAIL_INCLUDE,
  });
  if (!order) throw notFound('الطلب غير موجود / Order not found');
  return order;
}

async function assertCanView(
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
    throw unprocessable(
      'STATUS_UNCHANGED',
      `الطلب بالفعل في حالة "${ORDER_STATUS_LABELS[next].ar}" / Order is already ${ORDER_STATUS_LABELS[next].en}`
    );
  }

  if (isTerminalOrderStatus(current)) {
    throw unprocessable(
      'ORDER_CLOSED',
      `الطلب مُغلق (${ORDER_STATUS_LABELS[current].ar}) ولا يمكن تعديله / Order is closed and cannot change`
    );
  }

  if (!canTransitionOrderStatus(current, next)) {
    throw unprocessable(
      'ILLEGAL_TRANSITION',
      `لا يمكن الانتقال من "${ORDER_STATUS_LABELS[current].ar}" إلى "${ORDER_STATUS_LABELS[next].ar}" / Illegal transition ${current} → ${next}`
    );
  }

  if (!canRoleSetOrderStatus(actor.role, next)) {
    throw forbidden(
      `دورك لا يسمح بتعيين هذه الحالة / Your role may not set status ${next}`
    );
  }

  // Ownership rules that the generic role table cannot express.
  if (actor.role === UserRole.CUSTOMER) {
    if (order.customerId !== actor.sub) {
      throw forbidden('هذا ليس طلبك / Not your order');
    }
    // A customer may pull out only before the shop starts cooking.
    if (current !== OrderStatus.PENDING && current !== OrderStatus.ACCEPTED) {
      throw unprocessable(
        'CANCEL_WINDOW_CLOSED',
        'لا يمكن الإلغاء بعد بدء التحضير / Cannot cancel once preparation has started'
      );
    }
  }

  if (actor.role === UserRole.CAPTAIN) {
    // Claiming an unassigned job by moving it to ON_THE_WAY assigns it to them.
    const isClaiming = order.captainId === null && next === OrderStatus.ON_THE_WAY;
    if (order.captainId !== actor.sub && !isClaiming) {
      throw forbidden('الطلب غير مُسند إليك / This order is not assigned to you');
    }
  }

  const assignCaptainOnClaim =
    actor.role === UserRole.CAPTAIN && order.captainId === null && next === OrderStatus.ON_THE_WAY;

  let updated;
  try {
    updated = await prisma.$transaction(async tx => {
      const result = await tx.order.update({
        where: {
          id: orderId,
          // Optimistic lock for captain claim: if another captain already
          // claimed this order between our read and this write, Prisma will
          // throw P2025 (record not found for the filter) and we surface a
          // 409 instead of silently overwriting the first captain's assignment.
          ...(assignCaptainOnClaim ? { captainId: null } : {}),
        },
        data: {
          status: next,
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
      return result;
    });
  } catch (err) {
    // P2025 on a claim attempt means another captain got there first.
    if (
      assignCaptainOnClaim &&
      err instanceof Error &&
      'code' in err &&
      (err as { code?: string }).code === 'P2025'
    ) {
      throw conflict(
        'الطلب مُسند لكابتن آخر / This order was just claimed by another captain'
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
    throw unprocessable('ORDER_CLOSED', 'الطلب مُغلق / Order is closed');
  }

  const captain = await prisma.user.findUnique({
    where: { id: body.captainId },
    select: { id: true, role: true, isActive: true },
  });

  if (!captain || captain.role !== UserRole.CAPTAIN) {
    throw unprocessable('NOT_A_CAPTAIN', 'المستخدم ليس كابتن توصيل / User is not a captain');
  }
  if (!captain.isActive) {
    throw unprocessable('CAPTAIN_INACTIVE', 'حساب الكابتن موقوف / Captain account is inactive');
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
