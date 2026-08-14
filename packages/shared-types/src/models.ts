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
  /** CAPTAIN accounts need admin verification before taking jobs. */
  isVerified: boolean;
  /** CAPTAIN self-managed availability — must be on to claim orders. */
  isAvailable: boolean;
  /** Dedicated captains may serve this store only; null means shared pool. */
  assignedStoreId: string | null;
  /**
   * Processed avatar URL served by the uploads pipeline (see `/uploads`). The
   * backing object key is never exposed — only this public URL, which is
   * CDN-frontable and cached immutably.
   */
  profileImageUrl: string | null;
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
  /** Hidden from the public catalogue until an admin approves the store. */
  isApproved: boolean;
  managerId: string;
  /** WGS84 shopfront coordinates — powers the captain "navigate to store". */
  latitude: number | null;
  longitude: number | null;
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
  /** Returned only by the authenticated manager/admin catalogue endpoint. */
  dedicatedCaptains?: Array<Pick<PublicUser, 'id' | 'name' | 'phone' | 'isAvailable' | 'isVerified'>>;
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
  /** Customer instruction for this specific product, e.g. "no onions". */
  note: string | null;
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
   * Samou' has no reliable street numbering, so the captain phones the customer.
   * The customer address is intentionally free text with no lat/lng — GPS is
   * used only operationally (store coordinates + the assigned captain's live
   * position via `CaptainLocation`), never on the customer destination.
   */
  customerAddressText: string;
  /** Optional extra directions ("بجانب مسجد عمر، الطابق الثاني"). */
  addressNote: string | null;
  /** Customer instruction for the whole order, separate from directions. */
  orderNote: string | null;
  /** Kitchen estimate selected when the store accepts the order. */
  estimatedPrepMinutes: number | null;
  subtotal: number;
  /** Always derived from item count via `calculateDeliveryFee`. */
  deliveryFee: number;
  /** Voucher savings in ILS — 0 when no voucher was applied. */
  discount: number;
  /** The voucher that produced `discount`, or null. */
  voucherId: string | null;
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
  store: Pick<Store, 'id' | 'nameAr' | 'nameEn' | 'phone' | 'latitude' | 'longitude'>;
  captain: Pick<PublicUser, 'id' | 'name' | 'phone'> | null;
  statusHistory: OrderStatusHistoryEntry[];
  /** Resolved voucher identity for the discount — `null` when not applied. */
  voucher: { code: string; labelAr: string; labelEn: string } | null;
}

/** The condensed row used in list views. */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  itemCount: number;
  totalAmount: number;
  deliveryFee: number;
  discount: number;
  storeNameAr: string;
  createdAt: IsoDateTime;
  /** Customer instruction for the whole order, e.g. "اتصل قبل الوصول". */
  orderNote: string | null;
  /** Kitchen estimate chosen when the store accepted the order. */
  estimatedPrepMinutes: number | null;
  /**
   * Only the lines carrying a per-item instruction ("no onions"), so list
   * views can surface the kitchen-critical notes without shipping a full detail.
   */
  itemNotes: { productNameAr: string; quantity: number; note: string }[];
}
