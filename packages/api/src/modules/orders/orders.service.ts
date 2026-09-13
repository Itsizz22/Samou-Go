import { deliveryTransaction } from './delivery-transaction';
import { sizeOptionPriceDelta } from '@samou-go/shared-types';
import { resolveRouteFee } from '../zones/route-pricing';
import { nextPublicCode } from '../../lib/public-code';
import { sendPushToUser } from '../../lib/push';
import { orderProposalSchema } from './orders.schemas';
import { captainStoreIds, assignedStoresInclude } from '../auth/captain-stores';
import { captainPoolScope, PREPARATION_POOL_STATUSES, lockCaptainCapacity, eligibleCaptainIds } from './captain-pool';
import { withOrderSubmission } from '../../lib/order-submission';
import { automaticDeliveryPricing } from './pricing';
import { normalizeSelectedOptions, resolveSelectedOptions, normalizeOptionGroups } from '@samou-go/shared-types';
import type { Prisma, PrismaClient } from '../../lib/prisma-types';
import { randomUUID } from 'node:crypto';
import {
  OrderStatus,
  PaymentMethod,
  UserRole,
  calculateOrderTotals,
  calculateVoucherDiscount,
  canRoleSetOrderStatus,
  canRoleTransitionOrderStatus,
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
import { badRequest, badState, conflict, forbidden, notFound, unprocessable } from '../../lib/http-error';
import { decimalToNumber } from '../../lib/decimal';
import { formatOrderNumber, startOfDay } from '../../lib/order-number';
import { hashPassword } from '../../lib/password';
import { toOrderDetail, toOrderSummary } from './orders.mapper';
import { toProduct } from '../stores/stores.mapper';
import { creditDeliveredOrder } from '../platform/platform.service';
import type {
  AssignCaptainBody,
  CheckoutBody,
  CreateOrderBody,
  OrderListQuery,
  QuoteOrderBody,
  UpdateOrderStatusBody,
  CheckoutResult,
  CheckoutStoreResult,
} from './orders.schemas';

/** Creates a phone-bound CUSTOMER for guest checkout, or reuses an existing customer. */
export async function resolveGuestCustomer(guest: NonNullable<CreateOrderBody['guestCustomerInfo']>): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { phone: guest.phone } });
  if (existing) {
    // A known number belongs to an account. Reusing it anonymously would let
    // an attacker inject orders into another customer's history.
    throw conflict('هذا الرقم مسجل بالفعل، سجّل الدخول لإتمام الطلب / This phone already has an account; please sign in');
  }
  const user = await prisma.user.create({
    data: {
      publicCode: await nextPublicCode(UserRole.CUSTOMER, prisma),
      name: guest.name?.trim() || 'ضيف',
      phone: guest.phone,
      passwordHash: await hashPassword(`guest:${guest.phone}:${randomUUID()}`),
      role: UserRole.CUSTOMER,
      isVerified: false,
    },
  });
  return user.id;
}

/** The relation graph `toOrderDetail` expects. */
export const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  customer: true,
  store: true,
  captain: true,
  voucher: true,
  deliveryZone: true,
  rating: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

export const SUMMARY_INCLUDE = {
  items: {
    select: {
      id: true,
      totalPrice: true,
      selectedOptions: true,
      quantity: true,
      note: true,
      offerTitle: true,
      product: { select: { nameAr: true, imageUrl: true } },
    },
  },
  store: { select: { nameAr: true, phone: true, whatsappNumber: true } },
  customer: { select: { name: true, phone: true, whatsappNumber: true } },
  deliveryZone: { select: { nameAr: true } },
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
  nameAr?: string;
  sourceIndex?: number;
  productId: string | null;
  offerId?: string;
  offerTitle?: string;
  quantity: number;
  unitPrice: number;
  /** Resolved selected options with server-verified prices. */
  selectedOptions?: { id: string; groupId: string; name: string; priceDelta: number; excluded?: boolean }[];
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
 * and offers tables, never from the request. Matching variants are merged;
 * distinct options and notes retain separate lines. The `storeId` scoping means
 * a foreign product id can never be priced from another store.
 */
async function priceBasket(
  db: OrderDb,
  storeId: string,
  items: readonly { productId: string; quantity: number; note?: string; isOfferItem?: boolean; offerId?: string; offerTitle?: string; selectedOptions?: { groupId: string; optionId: string }[] }[]
): Promise<PricedLine[]> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, isActive: true, isApproved: true, isAcceptingOrders: true, storeStatus: true },
  });
  if (!store) throw notFound('المتجر غير موجود / Store not found');
  if (!store.isActive) {
    throw unprocessable('STORE_CLOSED', 'المتجر مغلق حالياً / This store is currently closed');
  }
  if (store.storeStatus === 'CLOSED' || store.isAcceptingOrders === false) {
    throw unprocessable('STORE_CLOSED', 'المتجر مغلق حالياً / This store is currently closed');
  }
  // An unapproved store has no public page, so it must not accept orders either.
  if (!store.isApproved) {
    throw unprocessable('STORE_NOT_APPROVED', 'المتجر غير معتمد بعد / This store is not approved yet');
  }

  // Collect offer IDs for standalone offer items.
  const offerIds = items.filter(it => it.isOfferItem && it.offerId).map(it => it.offerId!);
  const now = new Date();
  const offers = offerIds.length > 0
    ? await db.offer.findMany({ where: { id: { in: offerIds }, storeId, isActive: true,
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] },
        select: { id: true, titleAr: true, price: true } })
    : [];
  const offerById = new Map(offers.map(offer => [offer.id, offer]));

  const merged = new Map<string, { productId: string; quantity: number; sourceIndex: number; offerItem?: typeof items[number] }>();
  for (const [sourceIndex, item] of items.entries()) {
    const key = JSON.stringify([item.productId, item.offerId, item.note, [...(item.selectedOptions ?? [])].sort((a,b)=>a.optionId.localeCompare(b.optionId))]);
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(key, { productId: item.productId, quantity: item.quantity, sourceIndex, offerItem: item });
    }
  }

  const products = await db.product.findMany({
    where: { id: { in: [...new Set(items.map(item => item.productId))] }, storeId },
    select: { id: true, nameAr: true, price: true, originalPrice: true, optionsEnabled: true, isAvailable: true },
  });

  const byId = new Map(products.map(product => [product.id, product]));

  // Fetch all option groups and items for the products in this basket,
  // so we can validate selected options and price them server-side.
  const productIds = [...new Set(items.map(item => item.productId))];
  const optionGroups = await db.productOptionGroup.findMany({
    where: { productId: { in: productIds } },
    include: { items: { where: { isActive: true } } },
  });
  const optionGroupByProduct = new Map<string, typeof optionGroups>();
  const optionItemById = new Map<string, { id: string; groupId: string; name: string; price: number }>();
  for (const group of optionGroups) {
    const existing = optionGroupByProduct.get(group.productId) ?? [];
    existing.push(group);
    optionGroupByProduct.set(group.productId, existing);
    for (const item of group.items) {
      optionItemById.set(item.id, { id: item.id, groupId: group.id, name: item.name, price: item.price });
    }
  }

  const lines: PricedLine[] = [];
  for (const { productId, quantity, offerItem, sourceIndex } of merged.values()) {
    // For standalone offer items, use the offer's DB price.
    if (offerItem?.isOfferItem && offerItem.offerId) {
      const offer = offerById.get(offerItem.offerId);
      if (!offer || offer.price === null || decimalToNumber(offer.price) <= 0) {
        throw unprocessable('OFFER_UNAVAILABLE', 'العرض غير متاح حالياً / Offer is unavailable');
      }
      if (offerItem.selectedOptions?.length) throw badRequest('العروض لا تدعم إضافات المنتجات / Offers do not accept product options');
      lines.push({ productId: null, offerId: offer.id, offerTitle: offer.titleAr, nameAr: offer.titleAr,
        quantity, sourceIndex, unitPrice: decimalToNumber(offer.price) });
      continue;
    }
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

    let basePrice = Number(product.price);
    let resolvedOptions: PricedLine['selectedOptions'] = undefined;

    // Validate and price selected options from the DB.
    if (optionGroupByProduct.has(productId) || offerItem?.selectedOptions?.length) {
      const groups = product.optionsEnabled === false ? [] : optionGroupByProduct.get(productId) ?? [];
      const groupIds = new Set(groups.map(g => g.id));

      resolvedOptions = [];
      let optionsTotal = 0;

      const selectedIds = new Set<string>();
      const requested = [...(offerItem?.selectedOptions ?? [])];
      for (const group of groups.filter(g => g.kind === 'FIXED')) for (const item of group.items) if (!requested.some(s => s.optionId === item.id)) requested.push({groupId:group.id,optionId:item.id});
      for (const sel of requested) {
        if (selectedIds.has(sel.optionId)) {
          throw unprocessable('DUPLICATE_OPTION', 'Cannot select the same option more than once');
        }
        selectedIds.add(sel.optionId);
        // Validate the group belongs to this product.
        if (!groupIds.has(sel.groupId)) {
          throw unprocessable(
            'INVALID_OPTION_GROUP',
            `مجموعة الخيارات غير صالحة لهذا المنتج / Invalid option group for this product: ${sel.groupId}`
          );
        }
        // Validate the option item exists and belongs to the group.
        const item = optionItemById.get(sel.optionId);
        if (!item || item.groupId !== sel.groupId) {
          throw unprocessable(
            'INVALID_OPTION',
            `الخيار غير صالح / Invalid option: ${sel.optionId}`
          );
        }
        const group = groups.find(g => g.id === sel.groupId)!;
        const delta = group.kind === 'SIZE' ? sizeOptionPriceDelta(item.price, Number(product.price), product.originalPrice == null ? null : Number(product.originalPrice)) : item.price;
        optionsTotal += delta;
        resolvedOptions.push({ id: item.id, groupId: sel.groupId, name: item.name, priceDelta: delta });
      }

      // Validate min/max constraints per group.
      for (const group of groups) {
        if (!group.required && !resolvedOptions.some(o => o.groupId === group.id)) continue;
        const count = resolvedOptions.filter(o => o.groupId === group.id).length;
        const minimum = group.required ? Math.max(1, group.minSelect) : group.minSelect;
        if (count < minimum) {
          throw unprocessable(
            'OPTION_MIN_REQUIRED',
            `يجب اختيار ${minimum} من "${group.name}" على الأقل / Must select at least ${minimum} from "${group.name}"`
          );
        }
        if (count > group.maxSelect) {
          throw unprocessable(
            'OPTION_MAX_EXCEEDED',
            `الحد الأقصى لـ "${group.name}" هو ${group.maxSelect} / Max ${group.maxSelect} selections for "${group.name}"`
          );
        }
      }

      for (const group of groups.filter(g => g.kind === 'INGREDIENT')) for (const item of group.items) if (item.isDefault && !selectedIds.has(item.id)) resolvedOptions.push({id:item.id,groupId:group.id,name:'بدون ' + item.name,priceDelta:0,excluded:true});
      basePrice = Math.round((basePrice + optionsTotal) * 100) / 100;
    }

    lines.push({ productId, quantity, sourceIndex, nameAr: product.nameAr, unitPrice: basePrice, ...(resolvedOptions ? { selectedOptions: resolvedOptions } : {}) });
  }

  return lines;
}

/**
 * POST /orders/quote — the checkout screen calls this to show the delivery fee
 * before the customer commits. Same arithmetic as `createOrder`, no writes.
 */
export async function quoteOrder(body: QuoteOrderBody): Promise<OrderQuote> {
  const lines = await priceBasket(prisma, body.storeId, body.items);
  // Normalize null → undefined so the default 'central' zone kicks in.
  const region = body.deliveryRegion ?? undefined;
  const totals = calculateOrderTotals(lines, env.deliveryFeeConfig, region);
  const zone = body.fulfillmentType !== 'PICKUP' && body.deliveryZoneId
    ? await prisma.deliveryZone.findFirst({ where: { id: body.deliveryZoneId, isActive: true } })
    : null;
  if (body.fulfillmentType !== 'PICKUP' && body.deliveryZoneId && !zone) throw unprocessable('ZONE_INACTIVE', 'منطقة التوصيل غير متاحة / Delivery zone is unavailable');
  const settings = await prisma.platformSettings.findUnique({ where: { id: 'platform' } });
  const routeFee = await resolveRouteFee(prisma, body.storeId, body.deliveryZoneId, body.fulfillmentType === 'PICKUP');
  const pricing = automaticDeliveryPricing({ enabled: routeFee !== null || (settings?.autoPricingEnabled ?? false),
    zoneFee: routeFee ?? (zone ? decimalToNumber(zone.deliveryFee) : null), baseFee: decimalToNumber(settings?.baseDeliveryFee ?? 0),
    legacyFee: zone?.allowCaptainPricing ? 0 : zone ? decimalToNumber(zone.deliveryFee) : totals.deliveryFee,
    pickup: body.fulfillmentType === 'PICKUP', captainSharePercentage: decimalToNumber(settings?.captainSharePercentage ?? 100) });
  const { deliveryFee } = pricing;

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
    autoPricingEnabled: pricing.autoPriced,
    deliveryFee,
    discount,
    totalAmount: roundMoney(totals.subtotal + deliveryFee - discount),
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
  return withOrderSubmission(customerId, body.requestId, 'single', body, async tx => {
    // Everything below is inside ONE transaction:
    //   price the basket from the DB (authoritative), validate availability,
    //   resolve the voucher, then write order + items + status history.
    // If any step throws, the whole unit rolls back — no order, no items,
    // no voucher redemption, no partial financials.
    const lines = await priceBasket(tx, body.storeId, body.items);
    const region = body.deliveryRegion ?? undefined;
    const totals = calculateOrderTotals(lines, env.deliveryFeeConfig, region);
    const requestedZoneId = body.fulfillmentType === 'PICKUP'
      ? undefined
      : body.deliveryZoneId ?? body.guestCustomerInfo?.zoneId;
    const zone = requestedZoneId
      ? await tx.deliveryZone.findFirst({ where: { id: requestedZoneId, isActive: true } })
      : null;
    if (requestedZoneId && !zone) throw unprocessable('ZONE_INACTIVE', 'منطقة التوصيل غير متاحة / Delivery zone is unavailable');
    const settings = await tx.platformSettings.findUnique({ where: { id: 'platform' } });
    let captainPricing = body.fulfillmentType !== 'PICKUP' && !settings?.autoPricingEnabled && zone?.allowCaptainPricing === true;
    const routeFee = await resolveRouteFee(tx, body.storeId, requestedZoneId, body.fulfillmentType === 'PICKUP');
    const pricing = automaticDeliveryPricing({ enabled: routeFee !== null || (settings?.autoPricingEnabled ?? false),
      zoneFee: routeFee ?? (zone ? decimalToNumber(zone.deliveryFee) : null), baseFee: decimalToNumber(settings?.baseDeliveryFee ?? 0),
      legacyFee: captainPricing ? 0 : zone ? decimalToNumber(zone.deliveryFee) : totals.deliveryFee,
      pickup: body.fulfillmentType === 'PICKUP', captainSharePercentage: decimalToNumber(settings?.captainSharePercentage ?? 100) });
    if (routeFee !== null) captainPricing = false;
    const { deliveryFee } = pricing;

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
        fulfillmentType: body.fulfillmentType ?? 'DELIVERY',
        customerAddressText: body.customerAddressText,
        addressNote: body.addressNote ?? null,
        orderNote: body.orderNote ?? null,
        unavailableAction: body.unavailableAction,
        deliveryPreset: body.deliveryPreset ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        subtotal: totals.subtotal,
        // Zones are priced only from the admin-owned row, never from the client.
        autoPriced: pricing.autoPriced,
        captainSharePercentage: pricing.captainSharePercentage,
        deliveryZoneId: zone?.id ?? null,
        isCaptainPriced: captainPricing,
        driverQuotedFee: null,
        feeApprovalStatus: captainPricing ? 'PENDING_CUSTOMER_ACCEPTANCE' : 'APPROVED',
        deliveryFee,
        discount,
        totalAmount: body.fulfillmentType === 'PICKUP'
          ? roundMoney(totals.subtotal - discount)
          : roundMoney(totals.subtotal + deliveryFee - discount),
        voucherId: voucher?.id ?? null,
        paymentMethod: PaymentMethod.COD,
        deliveryPin: body.fulfillmentType === 'PICKUP' ? null : generateDeliveryPin(),
        voiceNoteUrl: body.voiceNoteUrl ?? null,
        voiceNoteDuration: body.voiceNoteDuration ?? null,
        items: {
          create: lines.map(line => {
            const itemSource = body.items[line.sourceIndex ?? 0];
            return {
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalPrice: lineTotal(line.unitPrice, line.quantity),
              note: itemSource?.note ?? null,
              isOfferItem: Boolean(line.offerId),
              offerTitle: line.offerTitle ?? null,
              offerId: line.offerId ?? null,
              // Pass the object directly — Prisma serialises JSON fields natively.
              selectedOptions: (line.selectedOptions ?? null) as unknown as Prisma.InputJsonValue,
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
    return toOrderDetail(order, 'CUSTOMER');
  });
}


/** Generate a random 4-digit PIN for delivery verification. */
function generateDeliveryPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Generate a random 4-digit store→captain pickup handoff code. */
function generateHandoffCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
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
 * Multi-store cart checkout
 * ------------------------------------------------------------------------- */

/**
 * POST /orders/checkout — splits a multi-store basket into independent
 * sub-orders, each with its own pricing, delivery fee, voucher, and state
 * machine. All sub-orders share the same `cartCheckoutId` for grouped display.
 *
 * Each sub-order is independently priced from the DB (the `priceBasket`
 * security boundary), and the entire batch is wrapped in a single transaction
 * so a failure on any store rolls back everything.
 *
 * Vouchers are intentionally excluded from multi-store checkout: each sub-order
 * is fully independent, and applying a voucher across stores creates ambiguous
 * redemption semantics. The customer may use a voucher on a single-store order
 * via `POST /orders`.
 */
export async function createCheckoutOrders(
  customerId: string,
  body: CheckoutBody,
): Promise<CheckoutResult> {
  const checkoutId = body.cartCheckoutId ?? (await import('node:crypto')).randomUUID();
  const results: CheckoutStoreResult[] = [];

  return withOrderSubmission(customerId, body.requestId, 'multi', body, async tx => {
    const now = new Date();
    // Shared sequence bump: one sequence row per day, incremented once per
    // store group. This gives each sub-order a unique order number.
    const sequence = await tx.dailyOrderSequence.upsert({
      where: { date: startOfDay(now) },
      update: { sequence: { increment: body.stores.length } },
      create: { date: startOfDay(now), sequence: body.stores.length },
    });

    let seqCursor = sequence.sequence - body.stores.length + 1;

    for (const storeGroup of body.stores) {
      const lines = await priceBasket(tx, storeGroup.storeId, storeGroup.items);
      const checkoutRegion = body.deliveryRegion ?? undefined;
      const totals = calculateOrderTotals(lines, env.deliveryFeeConfig, checkoutRegion);
      const zone = storeGroup.fulfillmentType !== 'PICKUP' && body.deliveryZoneId ? await tx.deliveryZone.findFirst({ where: { id: body.deliveryZoneId, isActive: true } }) : null;
      if (storeGroup.fulfillmentType !== 'PICKUP' && body.deliveryZoneId && !zone) throw unprocessable('ZONE_INACTIVE', 'منطقة التوصيل غير متاحة / Delivery zone unavailable');
      const settings = await tx.platformSettings.findUnique({ where: { id: 'platform' } });
      const routeFee = await resolveRouteFee(tx, storeGroup.storeId, body.deliveryZoneId, storeGroup.fulfillmentType === 'PICKUP');
      const pricing = automaticDeliveryPricing({ enabled: routeFee !== null || (settings?.autoPricingEnabled ?? false),
        zoneFee: routeFee ?? (zone ? decimalToNumber(zone.deliveryFee) : null), baseFee: decimalToNumber(settings?.baseDeliveryFee ?? 0),
        legacyFee: zone?.allowCaptainPricing ? 0 : zone ? decimalToNumber(zone.deliveryFee) : totals.deliveryFee, pickup: storeGroup.fulfillmentType === 'PICKUP',
        captainSharePercentage: decimalToNumber(settings?.captainSharePercentage ?? 100) });


      if (totals.subtotal <= 0) {
        throw unprocessable('EMPTY_BASKET', 'السلة فارغة / The basket is empty');
      }

      const orderNumber = formatOrderNumber(now, seqCursor++);

      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          storeId: storeGroup.storeId,
          cartCheckoutId: checkoutId,
          status: OrderStatus.PENDING,
          fulfillmentType: storeGroup.fulfillmentType ?? 'DELIVERY',
          customerAddressText: body.customerAddressText,
          addressNote: body.addressNote ?? null,
          orderNote: body.orderNote ?? null,
        unavailableAction: body.unavailableAction,
          deliveryPreset: body.deliveryPreset ?? null,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          subtotal: totals.subtotal,
          // PICKUP orders have no delivery fee.
          deliveryFee: pricing.deliveryFee,
          isCaptainPriced: storeGroup.fulfillmentType !== 'PICKUP' && routeFee === null && !settings?.autoPricingEnabled && zone?.allowCaptainPricing === true,
          feeApprovalStatus: storeGroup.fulfillmentType !== 'PICKUP' && routeFee === null && !settings?.autoPricingEnabled && zone?.allowCaptainPricing ? 'PENDING_CUSTOMER_ACCEPTANCE' : 'APPROVED',
          autoPriced: pricing.autoPriced,
          captainSharePercentage: pricing.captainSharePercentage,
          deliveryZoneId: storeGroup.fulfillmentType === 'PICKUP' ? null : zone?.id ?? null,
          discount: 0,
          totalAmount: storeGroup.fulfillmentType === 'PICKUP'
            ? totals.subtotal
            : roundMoney(totals.subtotal + pricing.deliveryFee),
          voucherId: null,
          paymentMethod: PaymentMethod.COD,
          deliveryPin: storeGroup.fulfillmentType === 'PICKUP' ? null : generateDeliveryPin(),
          items: {
            create: lines.map(line => {
              const itemSource = storeGroup.items[line.sourceIndex ?? 0];
              return {
                productId: line.productId,
                isOfferItem: Boolean(line.offerId),
                offerId: line.offerId ?? null,
                offerTitle: line.offerTitle ?? null,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                totalPrice: lineTotal(line.unitPrice, line.quantity),
                note: itemSource?.note ?? null,
                // Store server-validated selected options as JSON.
                // Pass the object directly — Prisma serialises JSON fields natively.
                selectedOptions: (line.selectedOptions ?? null) as unknown as Prisma.InputJsonValue,
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

      results.push({
        storeId: storeGroup.storeId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        subtotal: decimalToNumber(order.subtotal),
        deliveryFee: decimalToNumber(order.deliveryFee),
        totalAmount: decimalToNumber(order.totalAmount),
        itemCount: order.items.length,
      });
    }

    return {
      cartCheckoutId: checkoutId,
      orders: results,
      grandTotal: results.reduce((sum, r) => sum + r.totalAmount, 0),
      totalDeliveryFee: results.reduce((sum, r) => sum + r.deliveryFee, 0),
      totalItemCount: results.reduce((sum, r) => sum + r.itemCount, 0),
    };
  });
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
      return { OR: [{ captainId: actor.sub }, await captainPoolScope(actor.sub)] };
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
        ...(query.preparationPool ? { status: { in: PREPARATION_POOL_STATUSES }, fulfillmentType: "DELIVERY" } : query.status ? { status: query.status } : query.activeOnly ? { status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] } } : {}),
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
    items: rows.map(r => toOrderSummary(r, actor.role, actor.sub)),
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
  order: { id?: string; customerId: string; storeId: string; captainId: string | null; status: OrderStatus },
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
      if (order.id && await prisma.order.findFirst({ where: { AND: [{ id: order.id }, await captainPoolScope(actor.sub)] }, select: { id: true } })) return;
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
  return toOrderDetail(order, actor.role, actor.sub);
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
    where: { id: { in: order.items.flatMap(item => item.productId ? [item.productId] : []) } },
    include: { optionGroups: { include: { items: true } } },
  });
  const byId = new Map(currentProducts.map(product => [product.id, product]));
  const now = new Date();
  const currentOffers = await prisma.offer.findMany({ where: { id: { in: order.items.flatMap(item => item.offerId ? [item.offerId] : []) }, storeId: order.storeId,
    isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] } });
  const offersById = new Map(currentOffers.map(offer => [offer.id, offer]));

  let skipped = 0;
  const items: ReorderResult['items'] = [];
  for (const item of order.items) {
    if (item.isOfferItem) {
      const offer = item.offerId ? offersById.get(item.offerId) : undefined;
      if (!offer || offer.price === null || decimalToNumber(offer.price) <= 0) { skipped += 1; continue; }
      const price = decimalToNumber(offer.price);
      items.push({ quantity: item.quantity, ...(item.note ? { note: item.note } : {}),
        offer: { id: offer.id, storeId: offer.storeId, titleAr: offer.titleAr, price, imageUrl: offer.imageUrl },
        product: { id: `offer:${offer.id}`, storeId: offer.storeId, categoryId: null, nameAr: offer.titleAr, description: offer.descriptionAr, price, imageUrl: offer.imageUrl, isAvailable: true } });
      continue;
    }
    const product = item.productId ? byId.get(item.productId) : undefined;
    if (!product || !product.isAvailable) {
      skipped += 1;
      continue;
    }
    const dto = toProduct(product);
    let raw: unknown = item.selectedOptions;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
    const previous = normalizeSelectedOptions(raw);
    const selectedOptions = resolveSelectedOptions(dto.optionGroups, previous.filter(option => !option.excluded).map(option => ({ groupId: option.groupId, optionId: option.id })));
    const invalidSelection = selectedOptions.filter(o=>!o.excluded).length !== previous.filter(o=>!o.excluded).length || normalizeOptionGroups(dto.optionGroups).some(group => {
      const count = selectedOptions.filter(option => !option.excluded && option.groupId === group.id).length;
      return (!group.required && count === 0) ? false : count < Math.max(group.minSelect, group.required ? 1 : 0) || count > group.maxSelect;
    });
    if (invalidSelection) { skipped += 1; continue; }
    items.push({ product: dto, quantity: item.quantity, selectedOptions, ...(item.note ? { note: item.note } : {}) });
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

  if (!canTransitionOrderStatus(current, next, order.fulfillmentType)) {
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

  // The role-aware contract also encodes the cancel windows the actor table
  // cannot express (customer may cancel only before the kitchen starts; a
  // store may not abandon an order mid-route; a captain may not abandon after
  // pickup). A closed cancel window is a bad *request* (400) — the caller
  // reached for a legal target but from the wrong current state.
  if (!canRoleTransitionOrderStatus(actor.role, current, next, order.fulfillmentType)) {
    if (next === OrderStatus.CANCELLED) {
      throw badState(
        'CANCEL_WINDOW_CLOSED',
        'لا يمكن الإلغاء بعد بدء التحضير / Cannot cancel once preparation has started'
      );
    }
    throw forbidden(
      `دورك لا يسمح بهذا الانتقال من الحالة الحالية / Your role may not transition ${current} → ${next}`
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
    // Time-bound cancellation window: customers may cancel within 2 minutes
    // of placing the order, while it is still PENDING.
    if (next === OrderStatus.CANCELLED) {
      const elapsed = Date.now() - new Date(order.createdAt).getTime();
      const twoMinutesMs = 2 * 60 * 1000;
      if (current !== OrderStatus.PENDING || elapsed >= twoMinutesMs) {
        throw badState(
          'CANCEL_WINDOW_CLOSED',
          'لا يمكن إلغاء الطلب بعد مرور دقيقتين / Cannot cancel after 2 minutes'
        );
      }
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
      select: { id: true, isActive: true, isVerified: true, isAvailable: true, assignedStoreId: true, ...assignedStoresInclude },
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
    if (captain.blockedStores?.some(store => store.id === order.storeId)) throw unprocessable("CAPTAIN_STORE_BLOCKED", "الكابتن محجوب عن هذا المتجر");
    if (captainStoreIds(captain).length > 0 && !captainStoreIds(captain).includes(order.storeId)) {
      throw forbidden('هذا الطلب مخصص لمتجر آخر / This order belongs to another store');
    }
  }

  if (isClaimAttempt && !await prisma.order.findFirst({ where: { AND: [{ id: orderId }, await captainPoolScope(actor.sub)] }, select: { id: true } })) throw forbidden('الطلب غير متاح لك / Order is not available to you');
  const assignCaptainOnClaim = isClaimAttempt;

  // PICKUP orders cannot be claimed by captains — the store manager handles them.
  if (assignCaptainOnClaim && order.fulfillmentType === 'PICKUP') {
    throw forbidden('طلبات الاستلام لا يحتاجون كابتن / Pickup orders do not need a captain');
  }

  // Captain pickup-handoff code generation: the moment a delivery order becomes
  // READY_FOR_PICKUP, the store is about to hand a package to a captain — mint
  // a fresh 4-digit handoff code for that handover and reset the attempt
  // counter. PICKUP orders (customer walks in) and orders that already carry a
  // code (a store re-marking ready) keep their generated code stable.
  const mintsHandoffCode =
    next === OrderStatus.READY_FOR_PICKUP &&
    order.fulfillmentType !== 'PICKUP' &&
    order.captainHandoffCode === null;

  // Delivery PIN validation: when a captain transitions to DELIVERED,
  // they must provide the correct 4-digit PIN that the customer shares.
  // Rate-limited to 5 attempts per order to prevent brute-force.
  if (actor.role === UserRole.CAPTAIN && next === OrderStatus.DELIVERED) {
    const MAX_PIN_ATTEMPTS = 5;
    if ((order.deliveryPinAttempts ?? 0) >= MAX_PIN_ATTEMPTS) {
      throw badState(
        'PIN_LOCKED',
        'تم قفل رمز التوصيل due to too many failed attempts / Delivery PIN locked'
      );
    }
    if (!body.deliveryPin || body.deliveryPin !== order.deliveryPin) {
      // Increment attempts atomically
      await prisma.order.update({
        where: { id: orderId },
        data: { deliveryPinAttempts: { increment: 1 } },
      });
      const remaining = MAX_PIN_ATTEMPTS - ((order.deliveryPinAttempts ?? 0) + 1);
      throw badState(
        'INVALID_PIN',
        remaining > 0
          ? `رمز التوصيل خاطئ — متبقي ${remaining} محاولات / Incorrect PIN — ${remaining} attempts remaining`
          : 'تم قفل رمز التوصيل due to too many failed attempts / Delivery PIN locked'
      );
    }
  }

  // Captain pickup-handoff code validation: a captain moving a coded delivery
  // order from READY_FOR_PICKUP to ON_THE_WAY must enter the 4-digit code the
  // store employee handed them with the package. Rate-limited to 5 attempts to
  // prevent brute-forcing the handoff secret. Orders without a code (PICKUP,
  // legacy) skip this gate entirely.
  if (
    actor.role === UserRole.CAPTAIN &&
    next === OrderStatus.ON_THE_WAY &&
    order.captainHandoffCode !== null
  ) {
    const MAX_HANDOFF_ATTEMPTS = 5;
    if ((order.handoffCodeAttempts ?? 0) >= MAX_HANDOFF_ATTEMPTS) {
      throw forbidden(
        'تم استنفاد محاولات إدخال رمز الاستلام، يرجى التواصل مع إدارة المتجر / Handoff code attempts exhausted — contact the store manager'
      );
    }
    if (!body.handoffCode || body.handoffCode !== order.captainHandoffCode) {
      // Increment attempts atomically so concurrent guesses cannot race past
      // the lock.
      await prisma.order.update({
        where: { id: orderId },
        data: { handoffCodeAttempts: { increment: 1 } },
      });
      const remaining = MAX_HANDOFF_ATTEMPTS - ((order.handoffCodeAttempts ?? 0) + 1);
      throw badState(
        'INVALID_HANDOFF_CODE',
        remaining > 0
          ? `رمز الاستلام غير صحيح — متبقي ${remaining} محاولات / Invalid handoff code — ${remaining} attempts remaining`
          : 'تم استنفاد محاولات إدخال رمز الاستلام، يرجى التواصل مع إدارة المتجر / Handoff code attempts exhausted — contact the store manager'
      );
    }
  }

  let updated;
  try {
    updated = await deliveryTransaction(async tx => {
      if (assignCaptainOnClaim) await lockCaptainCapacity(tx, actor.sub, orderId);
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
          ...(next === OrderStatus.ACCEPTED ? { changeProposal: null, updatedAt: order.updatedAt } : {}),
          // Optimistic lock for captain claim: if another captain already
          // claimed this order between our read and this write, Prisma will
          // throw P2025 (record not found for the filter) and we surface a
          // 409 instead of silently overwriting the first captain's assignment.
          ...(actor.role === UserRole.CAPTAIN ? { captainId: assignCaptainOnClaim ? null : actor.sub } : {}),
          ...(assignCaptainOnClaim ? { OR: [{ dispatchCaptainId: null }, { dispatchCaptainId: actor.sub, dispatchExpiresAt: { gt: new Date() } }] } : {}),
        },
        data: {
          status: next,
          ...(next === OrderStatus.ACCEPTED ? { preparationStartedAt: new Date(), estimatedPrepMinutes: body.estimatedPrepMinutes ?? 20, estimatedReadyAt: new Date(Date.now()+(body.estimatedPrepMinutes ?? 20)*60_000) } : {}),
          ...(next === OrderStatus.READY_FOR_PICKUP ? { preparedAt: new Date() } : {}),
          ...(body.estimatedPrepMinutes !== undefined ? {
            estimatedPrepMinutes: body.estimatedPrepMinutes,
            estimatedReadyAt: new Date(Date.now() + body.estimatedPrepMinutes * 60_000),
            prepReminderSentAt: null, prepReminderLeaseUntil: null,
          } : {}),
          ...(assignCaptainOnClaim ? { captainId: actor.sub } : {}),
          ...(mintsHandoffCode
            ? { captainHandoffCode: generateHandoffCode(), handoffCodeAttempts: 0 }
            : {}),
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
          autoPriced: order.autoPriced,
          captainSharePercentage: order.captainSharePercentage,
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

  return toOrderDetail(updated, actor.role, actor.sub);
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
    select: { id: true, role: true, isActive: true, isVerified: true, assignedStoreId: true, ...assignedStoresInclude },
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
  if (captain.blockedStores?.some(store => store.id === order.storeId)) throw unprocessable("CAPTAIN_STORE_BLOCKED", "الكابتن محجوب عن هذا المتجر");
  if (captainStoreIds(captain).length > 0 && !captainStoreIds(captain).includes(order.storeId)) {
    throw unprocessable('CAPTAIN_STORE_MISMATCH', 'الكابتن مخصص لمتجر آخر / Captain is dedicated to another store');
  }

  if (order.captainId === captain.id) return toOrderDetail(order, actor.role, actor.sub);
  if (!PREPARATION_POOL_STATUSES.some(status => status === order.status) || order.fulfillmentType !== 'DELIVERY' || order.changeProposal) throw conflict('اعتمد الفاتورة قبل إسناد التوصيل / Approve the final order before assigning delivery');
  const updated = await deliveryTransaction(async tx => {
    await lockCaptainCapacity(tx, captain.id, orderId);
    if (!(await eligibleCaptainIds(order.storeId, tx)).includes(captain.id)) throw forbidden('الكابتن غير مؤهل لهذا المتجر / Captain is not eligible for this store');
    const changed = await tx.order.updateMany({ where: { id: orderId, captainId: order.captainId, status: order.status, updatedAt: order.updatedAt, changeProposal: null }, data: { captainId: captain.id, dispatchCaptainId: null, dispatchExpiresAt: null, prepReminderSentAt: null, prepReminderLeaseUntil: null } });
    if (!changed.count) throw conflict('تغير الطلب؛ حدّث الصفحة / Order changed');
    await tx.orderStatusHistory.create({ data: { orderId, status: order.status, changedByUserId: actor.sub, note: `تم إسناد الطلب للكابتن ${captain.id}` } });
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: DETAIL_INCLUDE });
  });

  return toOrderDetail(updated, actor.role, actor.sub);
}

/* ---------------------------------------------------------------------------
 * Delivery fee zone — the captain picks the ZONE, the fee is looked up
 * server-side from the admin-configured `DeliveryZone` row. The captain never
 * sends an amount, so "client never sends money" holds for this flow too.
 * ------------------------------------------------------------------------- */

/**
 * PATCH /orders/:orderId/delivery-zone — sets the delivery zone for an order
 * and derives the fee + total from the zone row. Only the assigned captain
 * (or an admin) may do this, and only while the order is still live.
 */
export async function setOrderDeliveryZone(
  actor: { sub: string; role: UserRole },
  orderId: string,
  zoneId: string
): Promise<OrderDetail> {
  const order = await loadOrderOrThrow(orderId);
  if (order.autoPriced) throw conflict('التسعير التلقائي مثبت لهذا الطلب / Automatic pricing is fixed for this order');

  if (actor.role === UserRole.CAPTAIN) {
    if (order.captainId !== actor.sub) {
      throw forbidden('الطلب غير مُسند إليك / This order is not assigned to you');
    }
  } else if (actor.role !== UserRole.ADMIN) {
    throw forbidden();
  }

  if (isTerminalOrderStatus(order.status)) {
    throw badState('ORDER_CLOSED', 'الطلب مُغلق / Order is closed');
  }

  const zone = await prisma.deliveryZone.findUnique({ where: { id: zoneId } });
  if (!zone) throw notFound('منطقة التوصيل غير موجودة / Delivery zone not found');
  if (!zone.isActive) {
    throw unprocessable(
      'ZONE_INACTIVE',
      'هذه المنطقة معطّلة حالياً — اختر منطقة أخرى / This zone is inactive — pick another one'
    );
  }

  // Money math stays server-side: the fee comes from the zone row and the
  // total is recomputed from the persisted subtotal/discount, never from the
  // request body.
  const deliveryFee = zone.allowCaptainPricing ? 0 : roundMoney(decimalToNumber(zone.deliveryFee));
  const totalAmount = roundMoney(
    decimalToNumber(order.subtotal) - decimalToNumber(order.discount) + deliveryFee
  );

  try {
    const updated = await prisma.order.update({
      // Optimistic lock on the status we validated against — a concurrent
      // status change (e.g. the order got delivered) makes this match zero
      // rows and surface a 409 instead of silently writing a fee on a closed order.
      where: { id: orderId, status: order.status },
      data: {
        deliveryZoneId: zone.id,
        deliveryFee,
        isCaptainPriced: zone.allowCaptainPricing,
        driverQuotedFee: null,
        feeApprovalStatus: zone.allowCaptainPricing ? 'PENDING_CUSTOMER_ACCEPTANCE' : 'APPROVED',
        totalAmount,
        statusHistory: {
          create: {
            status: order.status,
            changedByUserId: actor.sub,
            note: `تم تحديد منطقة التوصيل: ${zone.nameAr} / Delivery zone: ${zone.nameEn}`,
          },
        },
      },
      include: DETAIL_INCLUDE,
    });

    return toOrderDetail(updated, actor.role, actor.sub);
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: string }).code === 'P2025'
    ) {
      throw conflict(
        'تغيّرت حالة الطلب في هذه الأثناء — حدّث الصفحة وحاول مجدداً / Order status changed concurrently — refresh and retry'
      );
    }
    throw err;
  }
}

/** Assigned captain proposes a fee for an admin-enabled flexible zone. */
export async function quoteCaptainFee(actor: { sub: string; role: UserRole }, orderId: string, deliveryFee: number): Promise<OrderDetail> {
  const order = await loadOrderOrThrow(orderId);
  if (order.autoPriced) throw conflict('التسعير التلقائي مثبت لهذا الطلب / Automatic pricing is fixed for this order');
  if (actor.role !== UserRole.CAPTAIN || order.captainId !== actor.sub) throw forbidden();
  if (!order.deliveryZone?.allowCaptainPricing) throw unprocessable('ZONE_FIXED_FEE', 'هذه المنطقة لا تسمح برسوم مخصصة / This zone has a fixed fee');
  if (isTerminalOrderStatus(order.status)) throw badState('ORDER_CLOSED', 'الطلب مغلق / Order is closed');
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { isCaptainPriced: true, driverQuotedFee: roundMoney(deliveryFee), feeApprovalStatus: 'PENDING_CUSTOMER_ACCEPTANCE' },
    include: DETAIL_INCLUDE,
  });
  return toOrderDetail(updated, actor.role, actor.sub);
}

/** Customer accepts the captain's proposed fee; totals are recomputed server-side. */
export async function acceptCaptainFee(actor: { sub: string; role: UserRole }, orderId: string): Promise<OrderDetail> {
  const order = await loadOrderOrThrow(orderId);
  if (actor.role !== UserRole.CUSTOMER || order.customerId !== actor.sub) throw forbidden();
  if (order.feeApprovalStatus !== 'PENDING_CUSTOMER_ACCEPTANCE' || order.driverQuotedFee === null) {
    throw badState('FEE_NOT_PENDING', 'لا توجد رسوم معلقة للموافقة / No delivery fee is awaiting approval');
  }
  const deliveryFee = roundMoney(order.driverQuotedFee);
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      deliveryFee,
      totalAmount: roundMoney(decimalToNumber(order.subtotal) - decimalToNumber(order.discount) + deliveryFee),
      feeApprovalStatus: 'APPROVED',
    },
    include: DETAIL_INCLUDE,
  });
  return toOrderDetail(updated, actor.role, actor.sub);
}

/* ---------------------------------------------------------------------------
 * Dynamic review — the customer/store/captain sets a rating and comment for
 * an order when the order is in a non-terminal state. This is an exception to
 * the general "client never sends money" rule — it's a controlled, role-gated
 * flow where authenticated users can provide feedback on their order
 * experience.
 * ------------------------------------------------------------------------- */

/**
 * PATCH /orders/:orderId/review — sets a rating and comment for an order
 * when dynamic review is allowed. Only the order customer, store manager, or
 * admin may do this, and only while the order is still live.
 */
export async function setOrderReview(
  actor: { sub: string; role: UserRole },
  orderId: string,
  rating: number,
  comment: string | null
): Promise<OrderDetail> {
  const order = await loadOrderOrThrow(orderId);

  if (isTerminalOrderStatus(order.status)) {
    throw badState('ORDER_CLOSED', 'الطلب مُغلق / Order is closed');
  }

  // Authorization checks
  if (actor.role === UserRole.CUSTOMER) {
    if (order.customerId !== actor.sub) {
      throw forbidden('هذا ليس طلبك / This is not your order');
    }
  } else if (actor.role === UserRole.STORE_MANAGER) {
    // Store manager must own the store
    const store = await prisma.store.findUnique({ where: { id: order.storeId } });
    if (!store || store.managerId !== actor.sub) {
      throw forbidden('الطلب ليس من متجرك / This order is not from your store');
    }
  } else if (actor.role !== UserRole.ADMIN) {
    throw forbidden();
  }

  // Validate rating (1-5)
  if (rating < 1 || rating > 5) {
    throw unprocessable(
      'INVALID_RATING',
      'التقييم يجب أن يكون من 1 إلى 5 / Rating must be between 1 and 5'
    );
  }

  try {
    // Upsert the Rating row directly — the Rating model has required foreign keys
    // (customerId, storeId) that must come from the order itself.
    await prisma.rating.upsert({
      where: { orderId },
      create: {
        orderId,
        customerId: order.customerId,
        storeId: order.storeId,
        storeRating: rating,
        comment: comment ?? undefined,
      },
      update: {
        storeRating: rating,
        comment: comment ?? undefined,
      },
    });

    // Reload the order with relations to return the updated detail.
    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: DETAIL_INCLUDE,
    });

    return toOrderDetail(updated, actor.role, actor.sub);
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: string }).code === 'P2025'
    ) {
      throw conflict(
        'تغيّرت حالة الطلب في هذه الأثناء — حدّث الصفحة وحاول مجدداً / Order status changed concurrently — refresh and retry'
      );
    }
    throw err;
  }
}

/* ---------------------------------------------------------------------------
 * Dynamic delivery fee — the captain sets the fee manually when the platform
 * setting `isDriverDynamicFeeEnabled` is true. The captain sends an amount,
 * which is validated server-side. This is an EXCEPTION to "client never sends
 * money" — it's a controlled, admin-enabled flow where the driver (a trusted
 * actor) sets the fee based on their knowledge of the delivery area.
 * ------------------------------------------------------------------------- */

/**
 * PATCH /orders/:orderId/set-delivery-fee — sets a custom delivery fee for an
 * order when dynamic fee mode is enabled. Only the assigned captain (or admin)
 * may do this, and only while the order is still live.
 */
export async function setOrderDeliveryFee(
  actor: { sub: string; role: UserRole },
  orderId: string,
  deliveryFee: number
): Promise<OrderDetail> {
  const order = await loadOrderOrThrow(orderId);
  if (order.autoPriced) throw conflict('التسعير التلقائي مثبت لهذا الطلب / Automatic pricing is fixed for this order');

  // Check platform setting: fee entry is allowed when zones are disabled
  // (captain sets fee manually) OR when dynamic fee mode is explicitly enabled.
  const settings = await prisma.platformSettings.findUnique({ where: { id: 'platform' } });
  if (settings?.enableDeliveryZones && !settings?.isDriverDynamicFeeEnabled) {
    throw forbidden('نظام مناطق التوصيل مفعل — اختر منطقة بدلاً من تحديد الرسوم يدوياً / Delivery zones are enabled — pick a zone instead of setting fee manually');
  }

  if (actor.role === UserRole.CAPTAIN) {
    if (order.captainId !== actor.sub) {
      throw forbidden('الطلب غير مُسند إليك / This order is not assigned to you');
    }
  } else if (actor.role !== UserRole.ADMIN) {
    throw forbidden();
  }

  if (isTerminalOrderStatus(order.status)) {
    throw badState('ORDER_CLOSED', 'الطلب مُغلق / Order is closed');
  }

  // Validate the fee amount (0-1000 ILS)
  if (deliveryFee < 0 || deliveryFee > 1000) {
    throw unprocessable(
      'INVALID_FEE',
      'رسوم التوصيل يجب أن تكون بين 0 و 1000 ₪ / Delivery fee must be between 0 and 1000 ₪'
    );
  }

  // Money math stays server-side: the total is recomputed from the persisted
  // subtotal/discount + the provided fee, never trusting the request for totals.
  const totalAmount = roundMoney(
    decimalToNumber(order.subtotal) - decimalToNumber(order.discount) + deliveryFee
  );

  try {
    const updated = await prisma.order.update({
      // Optimistic lock on the status we validated against — a concurrent
      // status change (e.g. the order got delivered) makes this match zero
      // rows and surface a 409 instead of silently writing a fee on a closed order.
      where: { id: orderId, status: order.status },
      data: {
        deliveryFee: deliveryFee,
        totalAmount,
        statusHistory: {
          create: {
            status: order.status,
            changedByUserId: actor.sub,
            note: `تم تحديد رسوم التوصيل بواسطة السائق: ${deliveryFee.toFixed(2)} ₪ / Delivery fee set by driver: ${deliveryFee.toFixed(2)} ₪`,
          },
        },
      },
      include: DETAIL_INCLUDE,
    });

    return toOrderDetail(updated, actor.role, actor.sub);
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: string }).code === 'P2025'
    ) {
      throw conflict(
        'تغيّرت حالة الطلب في هذه الأثناء — حدّث الصفحة وحاول مجدداً / Order status changed concurrently — refresh and retry'
      );
    }
    throw err;
  }
}

/** Reservation keeps preparation status unchanged. A conditional database write selects one winner. */
export async function reserveOrder(actor: { sub: string; role: UserRole }, orderId: string): Promise<OrderDetail> {
  if (actor.role !== UserRole.CAPTAIN) throw forbidden();
  const existing = await loadOrderOrThrow(orderId);
  if (existing.captainId === actor.sub) return getOrder(actor, orderId);
  if (existing.fulfillmentType !== 'DELIVERY' || !(await eligibleCaptainIds(existing.storeId, prisma, true)).includes(actor.sub)) throw forbidden('الطلب غير متاح لك / Order unavailable');
  const scope = await captainPoolScope(actor.sub);
  await deliveryTransaction(async tx => {
    await lockCaptainCapacity(tx, actor.sub, orderId);
    if (!(await eligibleCaptainIds(existing.storeId, tx)).includes(actor.sub)) throw forbidden('الطلب غير متاح لك / Order is not available to you');
    const claimed = await tx.order.updateMany({ where: { AND: [{ id: orderId, captainId: null }, scope, { OR: [{ dispatchCaptainId: null }, { dispatchCaptainId: actor.sub, dispatchExpiresAt: { gt: new Date() } }] }] }, data: { captainId: actor.sub, dispatchCaptainId: null, dispatchExpiresAt: null, prepReminderSentAt: null, prepReminderLeaseUntil: null } });
    if (claimed.count !== 1) throw conflict('انتهى العرض أو حجز كابتن آخر الطلب / Offer expired or another captain reserved the order');
    await tx.orderStatusHistory.create({data:{orderId,status:existing.status,changedByUserId:actor.sub,note:'تم حجز التوصيل / Delivery reserved'}});
  });
  await Promise.all([existing.store.managerId, existing.customerId].map(id => sendPushToUser(id, { title: 'تم حجز التوصيل', body: `حجز كابتن توصيل الطلب #${existing.orderNumber}`, data: { type: 'CAPTAIN_RESERVED', orderId, screen: 'order' } }).catch(() => undefined)));
  return getOrder(actor, orderId);
}

/** Remaining time measured from this edit. Readiness still requires store confirmation. */
export async function updatePreparationTime(actor: { sub: string; role: UserRole }, orderId: string, minutes: number): Promise<OrderDetail> {
  if (actor.role !== UserRole.STORE_MANAGER && actor.role !== UserRole.ADMIN) throw forbidden();
  const order = await loadOrderOrThrow(orderId);
  await assertCanView(order, actor);
  if (order.status !== OrderStatus.ACCEPTED && order.status !== OrderStatus.PREPARING) throw conflict('لا يمكن تعديل وقت الطلب الآن / Preparation time cannot be changed now');
  const changed = await prisma.order.updateMany({ where: { id: orderId, status: order.status, updatedAt: order.updatedAt }, data: {
    estimatedPrepMinutes: minutes, estimatedReadyAt: new Date(Date.now() + minutes * 60_000), prepReminderSentAt: null, prepReminderLeaseUntil: null,
  } });
  if (!changed.count) throw conflict('تغير الطلب، حدّث الصفحة / Order changed; refresh');
  return getOrder(actor, orderId);
}

/** Release only the caller's reservation; pickup and release share the captain/status lock. */
export async function releaseReservation(actor: { sub: string; role: UserRole }, orderId: string, reason: string) {
  if (actor.role !== UserRole.CAPTAIN) throw forbidden();
  // Read outside the transaction: concurrent SQLite readers must not all try to
  // upgrade their read locks to writes. The first transactional statement is
  // the authoritative compare-and-swap; history is committed only by its winner.
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: { select: { managerId: true, nameAr: true } } } });
  if (!order || order.captainId !== actor.sub) throw forbidden('الطلب غير محجوز لك / This reservation is not yours');
  if (!PREPARATION_POOL_STATUSES.some(status => status === order.status)) throw conflict('لا يمكن الاعتذار بعد الاستلام / Cannot withdraw after pickup');
  return deliveryTransaction(async tx => {
    const released = await tx.order.updateMany({ where: { id: orderId, captainId: actor.sub, status: order.status }, data: { captainId: null, prepReminderSentAt: null, prepReminderLeaseUntil: null } });
    if (!released.count) throw conflict('تغير الطلب، حدّث الصفحة / Order changed; refresh');
    await tx.orderStatusHistory.create({ data: { orderId, status: order.status, changedByUserId: actor.sub, note: `اعتذار الكابتن عن التوصيل: ${reason}` } });
    return { orderId, orderNumber: order.orderNumber, storeId: order.storeId, store: order.store, status: order.status, released: true };
  });
}

/** Customer edits only the existing frozen-price basket before store acceptance. */
export async function editPendingOrder(customerId: string, orderId: string, body: import('zod').infer<typeof import('./orders.schemas').editPendingOrderSchema>): Promise<OrderDetail> {
  const result = await deliveryTransaction(async tx => {
    // Write-first CAS serializes against acceptance and prevents stale client edits.
    const locked = await tx.order.updateMany({ where: { id: orderId, customerId, status: OrderStatus.PENDING, changeProposal: null, updatedAt: new Date(body.updatedAt) }, data: { updatedAt: new Date() } });
    if (!locked.count) throw conflict('تغير الطلب أو قبله المتجر؛ حدّث الصفحة / Order changed or was accepted');
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: DETAIL_INCLUDE });
    const ids = new Set(body.items.map(item => item.id));
    if (ids.size !== body.items.length || body.items.length !== order.items.length || order.items.some(item => !ids.has(item.id))) throw badRequest('الأصناف لا تطابق الطلب / Invalid order lines');
    const next = body.items.map(item => ({ ...item, original: order.items.find(line => line.id === item.id)! }));
    if (!next.some(item => item.quantity > 0)) throw badRequest('لا يمكن ترك الطلب فارغاً؛ استخدم الإلغاء / Use cancellation for an empty order');
    for (const item of next.filter(item => item.quantity > item.original.quantity)) {
      if (item.original.isOfferItem) {
        const now = new Date();
        const available = item.original.offerId && await tx.offer.findFirst({ where: { id: item.original.offerId, storeId: order.storeId, isActive: true,
          price: { gt: 0 }, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] } });
        if (!available) throw badRequest('العرض غير متاح لزيادة الكمية / Offer is unavailable');
      } else if (!item.original.product?.isAvailable) throw badRequest('الصنف غير متوفر لزيادة الكمية / Product is unavailable');
    }
    const subtotal = Math.round(next.reduce((sum, item) => sum + decimalToNumber(item.original.unitPrice) * item.quantity, 0) * 100) / 100;
    const voucher = order.voucher;
    const discount = voucher ? calculateVoucherDiscount(subtotal, { type: voucher.discountType, value: decimalToNumber(voucher.discountValue), minSubtotal: voucher.minSubtotal === null ? undefined : decimalToNumber(voucher.minSubtotal), maxDiscount: voucher.maxDiscount === null ? undefined : decimalToNumber(voucher.maxDiscount) }) : 0;
    for (const item of next) {
      if (!item.quantity) await tx.orderItem.delete({ where: { id: item.id } });
      else await tx.orderItem.update({ where: { id: item.id }, data: { quantity: item.quantity, totalPrice: lineTotal(decimalToNumber(item.original.unitPrice), item.quantity), note: item.note ?? item.original.note } });
    }
    return tx.order.update({ where: { id: orderId }, data: { subtotal, discount, totalAmount: Math.round((subtotal - discount + decimalToNumber(order.deliveryFee)) * 100) / 100, ...(body.orderNote !== undefined ? { orderNote: body.orderNote } : {}) }, include: DETAIL_INCLUDE });
  });
  return toOrderDetail(result, UserRole.CUSTOMER);
}

export async function proposeOrderChange(actor: { sub: string; role: UserRole }, orderId: string, body: import('zod').infer<typeof orderProposalSchema>): Promise<OrderDetail> {
  const existing = await loadOrderOrThrow(orderId);
  if (actor.role !== UserRole.ADMIN && existing.store.managerId !== actor.sub) throw forbidden();
  const updated = await deliveryTransaction(async tx => {
    const lock = await tx.order.updateMany({ where: { id: orderId, status: OrderStatus.PENDING, updatedAt: new Date(body.updatedAt) }, data: { updatedAt: new Date() } });
    if (!lock.count) throw conflict('تغير الطلب؛ حدّث الصفحة / Order changed');
    const lines = await priceBasket(tx, existing.storeId, body.items);
    const subtotal = Math.round(lines.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0)*100)/100;
    const voucher = existing.voucher;
    const discount = voucher ? calculateVoucherDiscount(subtotal, { type: voucher.discountType, value: decimalToNumber(voucher.discountValue), minSubtotal: voucher.minSubtotal === null ? undefined : decimalToNumber(voucher.minSubtotal), maxDiscount: voucher.maxDiscount === null ? undefined : decimalToNumber(voucher.maxDiscount) }) : 0;
    const netSubtotal = Math.round((subtotal-discount)*100)/100;
    const proposal = JSON.stringify({ input: body.items, lines, subtotal, discount, netSubtotal, totalAmount: Math.round((netSubtotal+decimalToNumber(existing.deliveryFee))*100)/100, autoPriced: existing.autoPriced, createdAt: new Date().toISOString() });
    return tx.order.update({ where: { id: orderId }, data: { changeProposal: proposal }, include: DETAIL_INCLUDE });
  });
  await sendPushToUser(existing.customerId, { title: 'المتجر يقترح تعديل طلبك', body: `راجع البديل وسعره للطلب ${existing.orderNumber} قبل الموافقة`, data: { orderId, type: 'ORDER_CHANGE_PROPOSED' } }).catch(() => undefined);
  return toOrderDetail(updated, actor.role, actor.sub);
}
export async function decideOrderChange(customerId: string, orderId: string, updatedAt: string, accept: boolean): Promise<OrderDetail> {
  const result = await deliveryTransaction(async tx => {
    const locked = await tx.order.updateMany({ where: { id: orderId, customerId, status: OrderStatus.PENDING, updatedAt: new Date(updatedAt), changeProposal: { not: null } }, data: { updatedAt: new Date() } });
    if (!locked.count) throw conflict('تغير المقترح؛ حدّث الطلب / Proposal changed');
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: DETAIL_INCLUDE });
    await tx.orderStatusHistory.create({data:{orderId,status:OrderStatus.PENDING,changedByUserId:customerId,note:accept ? 'وافق العميل على تعديل الفاتورة' : 'رفض العميل تعديل الفاتورة'}});
    if (!accept) return toOrderDetail(await tx.order.update({ where: { id: orderId }, data: { changeProposal: null }, include: DETAIL_INCLUDE }), UserRole.CUSTOMER);
    const raw: unknown = JSON.parse(order.changeProposal!);
    if (!raw || typeof raw !== 'object' || !('input' in raw) || !('lines' in raw)) throw badRequest('مقترح غير صالح / Invalid proposal');
    const parsed = orderProposalSchema.parse({ updatedAt, items: raw.input });
    const lines = await priceBasket(tx, order.storeId, parsed.items);
    if (JSON.stringify(lines) !== JSON.stringify(raw.lines)) throw conflict('تغير السعر أو التوفر؛ اطلب مقترحاً محدثاً / Price or availability changed');
    const subtotal = Math.round(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) * 100) / 100;
    const voucher = order.voucher;
    const discount = voucher ? calculateVoucherDiscount(subtotal, { type: voucher.discountType, value: decimalToNumber(voucher.discountValue), minSubtotal: voucher.minSubtotal === null ? undefined : decimalToNumber(voucher.minSubtotal), maxDiscount: voucher.maxDiscount === null ? undefined : decimalToNumber(voucher.maxDiscount) }) : 0;
    if (!('discount' in raw) || raw.discount !== discount) throw conflict('تغير الخصم؛ اطلب مقترحاً محدثاً / Discount changed');
    await tx.orderItem.deleteMany({ where: { orderId } });
    return toOrderDetail(await tx.order.update({ where: { id: orderId }, data: {
      changeProposal: null, subtotal, discount, totalAmount: Math.round((subtotal - discount + decimalToNumber(order.deliveryFee)) * 100) / 100,
      items: { create: lines.map((line,index) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, totalPrice: lineTotal(line.unitPrice,line.quantity), note: parsed.items[line.sourceIndex ?? index]?.note, selectedOptions: line.selectedOptions ?? [], isOfferItem: Boolean(line.offerId), offerId: line.offerId, offerTitle: line.offerTitle })) },
    }, include: DETAIL_INCLUDE }), UserRole.CUSTOMER);
  });
  try {
    const manager = await prisma.store.findUnique({where:{id:result.storeId},select:{managerId:true}});
    if (manager) await sendPushToUser(manager.managerId, { title: accept ? 'وافق العميل على التعديل' : 'رفض العميل التعديل', body: `راجع الطلب #${result.orderNumber} واعتمد الفاتورة النهائية`, data: { type: 'ORDER_CHANGE_DECIDED', orderId, screen: 'order' } }).catch(() => undefined);
  } catch {
    // Notification lookup failures must not undo an already committed customer decision.
  }
  return result;
}
