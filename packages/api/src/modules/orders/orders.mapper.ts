import type {
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
  OrderStatusHistory as PrismaStatusHistory,
  Product as PrismaProduct,
  Store as PrismaStore,
  User as PrismaUser,
  Voucher as PrismaVoucher,
} from '@prisma/client';
import type {
  Order,
  OrderDetail,
  OrderItemWithProduct,
  OrderStatusHistoryEntry,
  OrderSummary,
} from '@samou-go/shared-types';
import { decimalToNumber } from '../../lib/decimal';

/** The `include` shape every detail query must use for `toOrderDetail` to typecheck. */
export type OrderWithRelations = PrismaOrder & {
  items: (PrismaOrderItem & { product: PrismaProduct })[];
  customer: PrismaUser;
  store: PrismaStore;
  captain: PrismaUser | null;
  voucher: PrismaVoucher | null;
  statusHistory: PrismaStatusHistory[];
};

export type OrderForSummary = PrismaOrder & {
  items: Pick<PrismaOrderItem, 'quantity'>[];
  store: Pick<PrismaStore, 'nameAr'>;
};

export function toOrder(order: PrismaOrder): Order {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    storeId: order.storeId,
    captainId: order.captainId,
    status: order.status,
    customerAddressText: order.customerAddressText,
    addressNote: order.addressNote,
    subtotal: decimalToNumber(order.subtotal),
    deliveryFee: decimalToNumber(order.deliveryFee),
    discount: decimalToNumber(order.discount),
    voucherId: order.voucherId,
    totalAmount: decimalToNumber(order.totalAmount),
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function toOrderItem(item: PrismaOrderItem & { product: PrismaProduct }): OrderItemWithProduct {
  return {
    id: item.id,
    orderId: item.orderId,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: decimalToNumber(item.unitPrice),
    totalPrice: decimalToNumber(item.totalPrice),
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

function toContact(user: PrismaUser): { id: string; name: string; phone: string } {
  return { id: user.id, name: user.name, phone: user.phone };
}

export function toOrderDetail(order: OrderWithRelations): OrderDetail {
  return {
    ...toOrder(order),
    items: order.items.map(toOrderItem),
    customer: toContact(order.customer),
    store: {
      id: order.store.id,
      nameAr: order.store.nameAr,
      nameEn: order.store.nameEn,
      phone: order.store.phone,
    },
    captain: order.captain ? toContact(order.captain) : null,
    voucher: order.voucher
      ? {
          code: order.voucher.code,
          labelAr: order.voucher.labelAr,
          labelEn: order.voucher.labelEn,
        }
      : null,
    statusHistory: order.statusHistory.map(toStatusHistoryEntry),
  };
}

export function toOrderSummary(order: OrderForSummary): OrderSummary {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: decimalToNumber(order.totalAmount),
    deliveryFee: decimalToNumber(order.deliveryFee),
    discount: decimalToNumber(order.discount),
    storeNameAr: order.store.nameAr,
    createdAt: order.createdAt.toISOString(),
  };
}
