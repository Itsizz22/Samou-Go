import type {
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
  OrderStatusHistory as PrismaStatusHistory,
  Product as PrismaProduct,
  Store as PrismaStore,
  User as PrismaUser,
  Voucher as PrismaVoucher,
  DeliveryZone as PrismaDeliveryZone,
} from '../../lib/prisma-types';
import type {
  Order,
  OrderDetail,
  OrderItemWithProduct,
  OrderStatusHistoryEntry,
  OrderSummary,
} from '@samou-go/shared-types';
import { UserRole } from '@samou-go/shared-types';
import { decimalToNumber } from '../../lib/decimal';

/**
 * The captain pickup-handoff code is a store→captain secret: only the store and
 * admins may read it. The captain must obtain it from the store employee at
 * handoff, so it is masked for CAPTAIN/CUSTOMER in every response shape.
 */
export function canViewCaptainHandoffCode(viewerRole?: string): boolean {
  return viewerRole === UserRole.STORE_MANAGER || viewerRole === UserRole.ADMIN;
}

/**
 * The `include` shape every detail query must use for `toOrderDetail` to typecheck.
 *
 * NOTE: `any` casts on `fulfillmentType`, `voiceNoteUrl`, `voiceNoteDuration`,
 * `isOfferItem`, `offerTitle`, `offerId` are required because the Prisma
 * generated client is stale (Windows Defender blocks `prisma generate`).
 * Remove the casts once the client is regenerated.
 */
function toContact(user: { id: string; name: string; phone: string }) {
  return { id: user.id, name: user.name, phone: user.phone };
}

export type OrderWithRelations = PrismaOrder & {
  items: (PrismaOrderItem & { product: PrismaProduct })[];
  customer: PrismaUser;
  store: PrismaStore;
  captain: PrismaUser | null;
  voucher: PrismaVoucher | null;
  deliveryZone: PrismaDeliveryZone | null;
  statusHistory: PrismaStatusHistory[];
};

export type OrderForSummary = PrismaOrder & {
  items: (Pick<PrismaOrderItem, 'quantity' | 'note'> & {
    product: Pick<PrismaProduct, 'nameAr'>;
  })[];
  store: Pick<PrismaStore, 'nameAr'>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function staleField<T>(obj: any, key: string, fallback: T): T {
  return key in obj ? obj[key] as T : fallback;
}

export function toOrder(order: PrismaOrder): Order {
  const raw = order as any;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    storeId: order.storeId,
    captainId: order.captainId,
    cartCheckoutId: order.cartCheckoutId ?? null,
    status: order.status,
    fulfillmentType: raw.fulfillmentType ?? 'DELIVERY',
    customerAddressText: order.customerAddressText,
    addressNote: order.addressNote,
    orderNote: order.orderNote,
    deliveryPreset: order.deliveryPreset,
    latitude: order.latitude,
    longitude: order.longitude,
    estimatedPrepMinutes: order.estimatedPrepMinutes,
    deliveryPin: order.deliveryPin ?? null,
    captainHandoffCode: order.captainHandoffCode ?? null,
    requiresHandoffCode: order.captainHandoffCode !== null,
    voiceNoteUrl: raw.voiceNoteUrl ?? null,
    voiceNoteDuration: raw.voiceNoteDuration ?? null,
    subtotal: decimalToNumber(order.subtotal),
    deliveryFee: decimalToNumber(order.deliveryFee),
    discount: decimalToNumber(order.discount),
    voucherId: order.voucherId,
    deliveryZoneId: order.deliveryZoneId,
    totalAmount: decimalToNumber(order.totalAmount),
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function toOrderItem(item: PrismaOrderItem & { product: PrismaProduct }): OrderItemWithProduct {
  const raw = item as any;
  return {
    id: item.id,
    orderId: item.orderId,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: decimalToNumber(item.unitPrice),
    totalPrice: decimalToNumber(item.totalPrice),
    note: item.note,
    isOfferItem: raw.isOfferItem ?? false,
    offerTitle: raw.offerTitle ?? null,
    offerId: raw.offerId ?? null,
    product: {
      id: item.product.id,
      nameAr: item.product.nameAr,
      imageUrl: item.product.imageUrl,
    },
  };
}

function toStatusHistoryEntry(entry: PrismaStatusHistory): OrderStatusHistoryEntry {
  return {
    id: entry.id,
    orderId: entry.orderId,
    status: entry.status,
    changedByUserId: entry.changedByUserId,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
  };
}

export function toOrderDetail(order: OrderWithRelations, viewerRole?: string): OrderDetail {
  const base = toOrder(order as any);
  return {
    ...base,
    deliveryPin: viewerRole === 'CUSTOMER' ? base.deliveryPin : null,
    captainHandoffCode: canViewCaptainHandoffCode(viewerRole) ? base.captainHandoffCode : null,
    items: order.items.map(toOrderItem),
    customer: toContact(order.customer),
    store: {
      id: order.store.id,
      nameAr: order.store.nameAr,
      nameEn: order.store.nameEn,
      phone: order.store.phone,
      latitude: order.store.latitude,
      longitude: order.store.longitude,
    },
    captain: order.captain ? toContact(order.captain) : null,
    voucher: order.voucher
      ? {
          code: order.voucher.code,
          labelAr: order.voucher.labelAr,
          labelEn: order.voucher.labelEn,
        }
      : null,
    deliveryZone: order.deliveryZone
      ? {
          id: order.deliveryZone.id,
          nameAr: order.deliveryZone.nameAr,
          nameEn: order.deliveryZone.nameEn,
          fee: decimalToNumber(order.deliveryZone.fee),
          isActive: order.deliveryZone.isActive,
          sortOrder: order.deliveryZone.sortOrder,
        }
      : null,
    statusHistory: order.statusHistory.map(toStatusHistoryEntry),
  };
}

export function toOrderSummary(order: OrderForSummary, viewerRole?: string): OrderSummary {
  const raw = order as any;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    captainId: order.captainId,
    cartCheckoutId: order.cartCheckoutId ?? null,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: decimalToNumber(order.totalAmount),
    deliveryFee: decimalToNumber(order.deliveryFee),
    discount: decimalToNumber(order.discount),
    storeNameAr: order.store.nameAr,
    createdAt: order.createdAt.toISOString(),
    orderNote: order.orderNote,
    deliveryPreset: order.deliveryPreset,
    fulfillmentType: raw.fulfillmentType ?? 'DELIVERY',
    estimatedPrepMinutes: order.estimatedPrepMinutes,
    captainHandoffCode: canViewCaptainHandoffCode(viewerRole)
      ? (order.captainHandoffCode ?? null)
      : null,
    requiresHandoffCode: order.captainHandoffCode !== null,
    itemNotes: order.items
      .filter((item) => item.note)
      .map((item) => ({
        productNameAr: item.product.nameAr,
        quantity: item.quantity,
        note: item.note,
      })),
  } as OrderSummary;
}
