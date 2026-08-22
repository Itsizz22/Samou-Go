/**
 * Samou' Go — domain models.
 *
 * Plain, transport-safe shapes: `Date` fields are serialised as ISO strings by
 * `res.json()`, so every timestamp is typed `string` here. These mirror
 * `prisma/schema.prisma` one-for-one, minus anything secret.
 */

import type { CustomRequestStatus, OrderStatus, PaymentMethod, UserRole } from './enums';

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
  /** Customer's own location from the browser geolocation flow. */
  latitude: number | null;
  longitude: number | null;
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
  /** Wide hero image behind the store header — `store` upload kind, `cover` purpose. */
  coverUrl: string | null;
  phone: string;
  isActive: boolean;
  /** Hidden from the public catalogue until an admin approves the store. */
  isApproved: boolean;
  /** Admin-curated: surfaces a "Recommended by us" badge on customer screens. */
  isRecommended: boolean;
  /** Instant toggle: false = customers see "closed" banner but store stays visible. */
  isAcceptingOrders: boolean;
  /** Store opening hour (HH:mm format, e.g. "08:00"). */
  openingTime: string | null;
  /** Store closing hour (HH:mm format, e.g. "23:00"). */
  closingTime: string | null;
  managerId: string;
  /** WGS84 shopfront coordinates — powers the captain "navigate to store". */
  latitude: number | null;
  longitude: number | null;
  /** Distance from the requesting customer, in km — present only on
   * `GET /api/v1/stores?lat=&lng=` (nearby-store queries). */
  distanceKm?: number;
  createdAt: IsoDateTime;
}

export interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  storeId: string;
  /** Menu ordering — lower renders first. `@@index([storeId, sortOrder])` in Prisma. */
  sortOrder: number;
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

/** An admin-configured delivery fee zone. The fee is authoritative — the
 * captain picks the zone, the server derives the fee from this row. */
export interface DeliveryZone {
  id: string;
  nameAr: string;
  nameEn: string;
  /** The full delivery fee for this zone, in ILS. */
  fee: number;
  isActive: boolean;
  sortOrder: number;
}

/** A store-scoped promotional announcement — marketing display, NOT a
 * redeemable code (that's `Voucher`). */
export interface Offer {
  id: string;
  storeId: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  imageUrl: string | null;
  startsAt: IsoDateTime | null;
  expiresAt: IsoDateTime | null;
  isActive: boolean;
  /** Targeted product IDs — empty array = store-wide offer. */
  productIds: string[];
  sortOrder: number;
  createdAt: IsoDateTime;
}

/** A store with its full catalogue — `GET /api/v1/stores/:id`. */
export interface StoreWithCatalogue extends Store {
  categories: CategoryWithProducts[];
  /** Returned only by the authenticated manager/admin catalogue endpoint. */
  dedicatedCaptains?: Array<Pick<PublicUser, 'id' | 'name' | 'phone' | 'isAvailable' | 'isVerified'>>;
}

/* ---------------------------------------------------------------------------
 * Custom requests
 * ------------------------------------------------------------------------- */

/**
 * A customer's request for something the store doesn't list — a special order
 * (طلب مخصص). The store replies with a price via `PRICE_OFFERED`; the customer
 * then accepts or rejects. Fulfilment is manual (phone), so there is no
 * follow-on delivery flow.
 */
export interface CustomRequest {
  id: string;
  customerId: string;
  storeId: string;
  /** What the customer wants — free text, e.g. "كيلو كبدة طازجة". */
  description: string;
  status: CustomRequestStatus;
  /** The store's quote in ILS — `null` until the store makes an offer. */
  offeredPrice: number | null;
  /** The store manager's optional note alongside the quote. */
  offerNote: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Custom request with the store identity joined in, for customer displays. */
export interface CustomRequestWithStore extends CustomRequest {
  store: Pick<Store, 'id' | 'nameAr' | 'nameEn' | 'logoUrl'>;
}

/** Custom request with the requesting customer joined in, for store displays. */
export interface CustomRequestWithCustomer extends CustomRequest {
  customer: Pick<PublicUser, 'id' | 'name' | 'phone'>;
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
  /**
   * Links sub-orders created from a multi-store cart checkout.  Null for
   * legacy single-store orders; set to the same CUID across all sub-orders
   * when a customer checks out items from multiple stores in one session.
   */
  cartCheckoutId: string | null;
  status: OrderStatus;
  /**
   * Free-text destination — neighbourhood, street, landmark.
   * Samou' has no reliable street numbering, so the captain phones the customer.
   */
  customerAddressText: string;
  /** Optional extra directions ("بجانب مسجد عمر، الطابق الثاني"). */
  addressNote: string | null;
  /** Customer instruction for the whole order, separate from directions. */
  orderNote: string | null;
  /** Delivery preset: "call_on_arrival", "leave_at_door", or null. */
  deliveryPreset: string | null;
  /** GPS coordinates of the delivery pin — null for legacy orders. */
  latitude: number | null;
  longitude: number | null;
  /** Kitchen estimate selected when the store accepts the order. */
  estimatedPrepMinutes: number | null;
  subtotal: number;
  /** Fee from the captain-selected `deliveryZone`, or 0 before one is set. */
  deliveryFee: number;
  /** Voucher savings in ILS — 0 when no voucher was applied. */
  discount: number;
  /** The voucher that produced `discount`, or null. */
  voucherId: string | null;
  /** Fee zone chosen by the assigned captain (fee derived server-side). */
  deliveryZoneId: string | null;
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
  /** The fee zone chosen by the captain, when set. */
  deliveryZone: DeliveryZone | null;
}

/** The condensed row used in list views. */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** Assigned captain (`null` = still in the unclaimed pool). */
  captainId: string | null;
  /** Links sub-orders from a multi-store cart checkout. */
  cartCheckoutId: string | null;
  itemCount: number;
  totalAmount: number;
  deliveryFee: number;
  discount: number;
  storeNameAr: string;
  createdAt: IsoDateTime;
  /** Customer instruction for the whole order, e.g. "اتصل قبل الوصول". */
  orderNote: string | null;
  /** Delivery preset: "call_on_arrival", "leave_at_door", or null. */
  deliveryPreset: string | null;
  /** Kitchen estimate chosen when the store accepted the order. */
  estimatedPrepMinutes: number | null;
  /**
   * Only the lines carrying a per-item instruction ("no onions"), so list
   * views can surface the kitchen-critical notes without shipping a full detail.
   */
  itemNotes: { productNameAr: string; quantity: number; note: string }[];
}
