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
function toContact(user: { id: string; name: string; phone: string; whatsappNumber?: string | null }) {
  return { id: user.id, name: user.name, phone: user.phone, whatsappNumber: user.whatsappNumber ?? null };
}

export type OrderWithRelations = PrismaOrder & {
  items: (PrismaOrderItem & { product: PrismaProduct | null })[];
  customer: PrismaUser;
  store: PrismaStore;
  captain: PrismaUser | null;
  voucher: PrismaVoucher | null;
  deliveryZone: PrismaDeliveryZone | null;
  statusHistory: PrismaStatusHistory[];
};

export type OrderForSummary = PrismaOrder & {
  customer?: Pick<PrismaUser, 'name' | 'phone' | 'whatsappNumber'>;
  deliveryZone?: Pick<PrismaDeliveryZone, 'nameAr'> | null;
  items: (Pick<PrismaOrderItem, 'id' | 'totalPrice' | 'selectedOptions' | 'quantity' | 'note'> & { offerTitle?: string | null } & {
    product: Pick<PrismaProduct, 'nameAr'> & { imageUrl?: string | null } | null;
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
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    deliveryPin: order.deliveryPin ?? null,
    captainHandoffCode: order.captainHandoffCode ?? null,
    requiresHandoffCode: order.captainHandoffCode !== null,
    voiceNoteUrl: raw.voiceNoteUrl ?? null,
    voiceNoteDuration: raw.voiceNoteDuration ?? null,
    subtotal: decimalToNumber(order.subtotal),
    deliveryFee: decimalToNumber(order.deliveryFee),
    autoPriced: order.autoPriced,
    discount: decimalToNumber(order.discount),
    voucherId: order.voucherId,
    deliveryZoneId: order.deliveryZoneId,
    isCaptainPriced: raw.isCaptainPriced ?? false,
    driverQuotedFee: raw.driverQuotedFee ?? null,
    feeApprovalStatus: raw.feeApprovalStatus ?? 'APPROVED',
    totalAmount: decimalToNumber(order.totalAmount),
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function toOrderItem(item: PrismaOrderItem & { product: PrismaProduct | null }): OrderItemWithProduct {
  const raw = item as any;
  // Parse selectedOptions JSON if present.
  let selectedOptions: any[] | null = null;
  if (raw.selectedOptions) {
    try {
      selectedOptions = typeof raw.selectedOptions === 'string'
        ? JSON.parse(raw.selectedOptions)
        : raw.selectedOptions;
    } catch { /* malformed JSON — return null */ }
  }
  return {
    id: item.id,
    orderId: item.orderId,
    productId: item.productId ?? `offer:${item.offerId ?? item.id}`,
    quantity: item.quantity,
    unitPrice: decimalToNumber(item.unitPrice),
    totalPrice: decimalToNumber(item.totalPrice),
    note: item.note,
    isOfferItem: raw.isOfferItem ?? false,
    offerTitle: raw.offerTitle ?? null,
    offerId: raw.offerId ?? null,
    selectedOptions,
    product: {
      id: item.productId ?? `offer:${item.offerId ?? item.id}`,
      nameAr: item.offerTitle ?? item.product?.nameAr ?? 'عرض غير متاح',
      imageUrl: item.product?.imageUrl ?? null,
    },
  } as any;
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

export function toOrderDetail(order: OrderWithRelations, viewerRole?: string, viewerId?: string): OrderDetail {
  const base = toOrder(order);
  const restricted = viewerRole === UserRole.CAPTAIN && (!viewerId || order.captainId !== viewerId);
  return {
    unavailableAction: order.unavailableAction === "REMOVE" ? "REMOVE" : order.unavailableAction === "SUGGEST" ? "SUGGEST" : "CONTACT",
    changeProposal: restricted ? null : order.changeProposal,

    ...base,
    deliveryPin: viewerRole === 'CUSTOMER' ? base.deliveryPin : null,
    captainHandoffCode: canViewCaptainHandoffCode(viewerRole) ? base.captainHandoffCode : null,
    items: order.items.map(item => ({ ...toOrderItem(item), ...(restricted ? { note: null } : {}) })),
    customer: restricted ? { id: '', name: '', phone: '' } : toContact(order.customer),
    ...(restricted ? { customerId: '', customerAddressText: '', addressNote: null, orderNote: null, latitude: null, longitude: null, voiceNoteUrl: null, voiceNoteDuration: null } : {}),
    store: {
      id: order.store.id,
      nameAr: order.store.nameAr,
      nameEn: order.store.nameEn,
      phone: order.store.phone,
      whatsappNumber: order.store.whatsappNumber ?? null,
      latitude: order.store.latitude,
      longitude: order.store.longitude,
    },
    captain: !restricted && order.captain ? toContact(order.captain) : null,
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
          deliveryFee: decimalToNumber(order.deliveryZone.deliveryFee),
          fee: decimalToNumber(order.deliveryZone.deliveryFee),
          allowCaptainPricing: order.deliveryZone.allowCaptainPricing,
          isActive: order.deliveryZone.isActive,
          sortOrder: order.deliveryZone.sortOrder,
        }
      : null,
    statusHistory: restricted ? [] : order.statusHistory.map(toStatusHistoryEntry),
  };
}

function optionNames(value: unknown): string[] {
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown) =>
      entry && typeof entry === 'object' && 'name' in entry && typeof entry.name === 'string'
        ? [entry.name] : []);
  } catch { return []; }
}

export function toOrderSummary(order: OrderForSummary, viewerRole?: string, viewerId?: string): OrderSummary {
  const restricted = viewerRole === UserRole.CAPTAIN && (!viewerId || order.captainId !== viewerId);
  const staff = viewerRole === UserRole.STORE_MANAGER || (viewerRole === UserRole.CAPTAIN && !restricted) || viewerRole === UserRole.ADMIN;
  const raw = order as any;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    captainId: order.captainId,
    cartCheckoutId: order.cartCheckoutId ?? null,
    customerContact: staff && order.customer ? { name: order.customer.name, phone: order.customer.phone, whatsappNumber: order.customer.whatsappNumber ?? null } : null,
    deliveryDestination: staff || restricted ? { zoneNameAr: order.deliveryZone?.nameAr ?? null, address: restricted ? "يظهر العنوان بعد حجز التوصيل" : order.customerAddressText, landmark: restricted ? null : order.addressNote } : null,
    ...(canViewCaptainHandoffCode(viewerRole) ? { items: order.items.map(item => ({
      id: item.id,
      productNameAr: item.offerTitle ?? item.product?.nameAr ?? 'منتج غير متاح',
      imageUrl: item.product?.imageUrl ?? null,
      quantity: item.quantity,
      totalPrice: decimalToNumber(item.totalPrice),
      note: item.note,
      optionNames: optionNames(item.selectedOptions),
    })) } : {}),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: decimalToNumber(order.totalAmount),
    deliveryFee: decimalToNumber(order.deliveryFee),
    autoPriced: order.autoPriced,
    discount: decimalToNumber(order.discount),
    storeNameAr: order.store.nameAr,
    createdAt: order.createdAt.toISOString(),
    orderNote: restricted ? null : order.orderNote,
    deliveryPreset: order.deliveryPreset,
    fulfillmentType: raw.fulfillmentType ?? 'DELIVERY',
    estimatedPrepMinutes: order.estimatedPrepMinutes,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    captainHandoffCode: canViewCaptainHandoffCode(viewerRole)
      ? (order.captainHandoffCode ?? null)
      : null,
    requiresHandoffCode: order.captainHandoffCode !== null,
    itemNotes: (restricted ? [] : order.items)
      .filter((item) => item.note)
      .map((item) => ({
        productNameAr: item.offerTitle ?? item.product?.nameAr ?? 'عرض غير متاح',
        quantity: item.quantity,
        note: item.note,
      })),
  } as OrderSummary;
}
