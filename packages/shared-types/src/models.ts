/**
 * Samou' Go — domain models.
 *
 * Plain, transport-safe shapes: `Date` fields are serialised as ISO strings by
 * `res.json()`, so every timestamp is typed `string` here. These mirror
 * `prisma/schema.prisma` one-for-one, minus anything secret.
 */

import type { OrderStatus, PaymentMethod, UserRole } from './enums';

/** ISO-8601 timestamp, e.g. `"2026-07-28T09:14:00.000Z"`. */
export type IsoDateTime = string;

/* ---------------------------------------------------------------------------
 * User
 * ------------------------------------------------------------------------- */

/**
 * A user as the API returns it. `passwordHash` is deliberately absent —
 * it never leaves `packages/api`.
 */
export interface PublicUser {
  id: string;
  name: string;
  /** Palestinian mobile, stored canonical: `05XXXXXXXX`. */
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/* ---------------------------------------------------------------------------
 * Catalogue
 * ------------------------------------------------------------------------- */

export interface Store {
  id: string;
  nameAr: string;
  nameEn: string;
  logoUrl: string | null;
  phone: string;
  isActive: boolean;
  managerId: string;
  createdAt: IsoDateTime;
}

export interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  storeId: string;
}

export interface Product {
  id: string;
  nameAr: string;
  description: string | null;
  /** ILS. Decimal(10,2) in PostgreSQL, serialised as a number. */
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  categoryId: string | null;
  storeId: string;
}

/** A category with its products inlined — the shape the menu screen wants. */
export interface CategoryWithProducts extends Category {
  products: Product[];
}

/** A store with its full catalogue — `GET /api/v1/stores/:id`. */
export interface StoreWithCatalogue extends Store {
  categories: CategoryWithProducts[];
}

/* ---------------------------------------------------------------------------
 * Orders
 * ------------------------------------------------------------------------- */

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  /** Price captured at order time; the product may be repriced later. */
  unitPrice: number;
  totalPrice: number;
}

export interface OrderStatusHistoryEntry {
  id: string;
  orderId: string;
  status: OrderStatus;
  changedByUserId: string | null;
  note: string | null;
  createdAt: IsoDateTime;
}

export interface Order {
  id: string;
  /** Human-facing reference, e.g. `SG-260728-0042`. Unique. */
  orderNumber: string;
  customerId: string;
  storeId: string;
  captainId: string | null;
  status: OrderStatus;
  /**
   * Free-text destination — neighbourhood, street, landmark.
   * Samou' has no reliable street addressing and this platform ships no GPS,
   * so the captain phones the customer. There is intentionally no lat/lng.
   */
  customerAddressText: string;
  /** Optional extra directions ("بجانب مسجد عمر، الطابق الثاني"). */
  addressNote: string | null;
  subtotal: number;
  /** Always derived from item count via `calculateDeliveryFee`. */
  deliveryFee: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** An order item with the product joined in, for display. */
export interface OrderItemWithProduct extends OrderItem {
  product: Pick<Product, 'id' | 'nameAr' | 'imageUrl'>;
}

/** The full order as the tracking and store-manager screens consume it. */
export interface OrderDetail extends Order {
  items: OrderItemWithProduct[];
  customer: Pick<PublicUser, 'id' | 'name' | 'phone'>;
  store: Pick<Store, 'id' | 'nameAr' | 'nameEn' | 'phone'>;
  captain: Pick<PublicUser, 'id' | 'name' | 'phone'> | null;
  statusHistory: OrderStatusHistoryEntry[];
}

/** The condensed row used in list views. */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  itemCount: number;
  totalAmount: number;
  deliveryFee: number;
  storeNameAr: string;
  createdAt: IsoDateTime;
}
