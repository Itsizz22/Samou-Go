/**
 * Samou' Go — request / response contracts.
 *
 * Every HTTP body the API accepts or returns is described here, so a front-end
 * can be typed against the API without importing server code.
 */

import type { OrderStatus, UserRole, VoucherDiscountType } from "./enums";
import type { DeliveryRegion } from './delivery';
import type {
  OrderDetail,
  OrderSummary,
  Product,
  PublicUser,
  Store,
} from "./models";

/* ---------------------------------------------------------------------------
 * Envelope
 * ------------------------------------------------------------------------- */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFieldError {
  /** Dotted path into the request body, e.g. `"items.0.quantity"`. */
  path: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  error: {
    /** Machine-readable, SCREAMING_SNAKE, e.g. `VALIDATION_ERROR`. */
    code: string;
    /** Bilingual, safe to show the user. */
    message: string;
    details?: ApiFieldError[];
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

/* ---------------------------------------------------------------------------
 * Auth
 * ------------------------------------------------------------------------- */

export interface RegisterInput {
  name: string;
  /** `05XXXXXXXX` — Palestinian mobile. */
  phone: string;
  password: string;
  /** Defaults to `CUSTOMER`; only an admin may create other roles. */
  role?: UserRole;
}

export interface LoginInput {
  phone: string;
  password: string;
}

export interface AuthResponse {
  user: PublicUser;
  /** Bearer token for `Authorization: Bearer <token>`. */
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  /**
   * Opaque long-lived token, hashed at rest, used to mint new access tokens
   * without re-entering credentials. Rotated on every refresh. Absent on
   * legacy login responses from older servers — treat as optional.
   */
  refreshToken?: string;
}

/* ---------------------------------------------------------------------------
 * OTP (passwordless phone sign-in)
 * ------------------------------------------------------------------------- */

/** POST /auth/otp/request — ask for a one-time code on a mobile number. */
export interface OtpRequestInput {
  /** `05XXXXXXXX` — Palestinian mobile. */
  phone: string;
}

/** What the server reports after asking for (or dispatching) an OTP. */
export interface OtpDispatchResult {
  /** Friendly hint so a legit user does not hammer the resend button. */
  retryAfterSeconds: number;
  /** True when the code was dispatched to a live carrier (not the console provider). */
  dispatched: boolean;
}

/** POST /auth/register — the account is created but awaits OTP verification. */
export interface RegisterPendingResponse {
  user: PublicUser;
  /**
   * Always `true`: registration never returns a session until the phone is
   * proven with the one-time code it just dispatched.
   */
  verificationRequired: true;
  otp: OtpDispatchResult;
}

/** POST /auth/otp/verify — exchange a code for a session. */
export interface OtpVerifyInput {
  /** `05XXXXXXXX` — the phone the code was sent to. */
  phone: string;
  /** 6-digit code. */
  code: string;
  /**
   * For a brand-new phone number the server auto-provisions a CUSTOMER
   * account; pass a display name to avoid the placeholder. Ignored when the
   * phone already has an account.
   */
  name?: string;
}

/** POST /auth/refresh — exchange a refresh token for a fresh pair. */
export interface RefreshTokenInput {
  refreshToken: string;
}

/** Proves control of a phone with an OTP, then replaces its password. */
export interface ResetPasswordInput {
  phone: string;
  code: string;
  password: string;
}

/** Decoded JWT body. Kept small — never put a role-changing flag in here. */
export interface JwtPayload {
  sub: string;
  role: UserRole;
  phone: string;
  iat?: number;
  exp?: number;
}

/* ---------------------------------------------------------------------------
 * Catalogue
 * ------------------------------------------------------------------------- */

export interface StoreListQuery extends PaginationQuery {
  /** Substring match against `nameAr` / `nameEn`. */
  search?: string;
  /** Defaults to `true` — inactive stores are hidden from the public catalogue. */
  activeOnly?: boolean;
}

export interface ProductListQuery extends PaginationQuery {
  categoryId?: string;
  search?: string;
  availableOnly?: boolean;
}

/* ---------------------------------------------------------------------------
 * Orders
 * ------------------------------------------------------------------------- */

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
  note?: string;
}

/**
 * Note what is NOT here: `subtotal`, `deliveryFee`, `totalAmount`.
 * The client never sends money. The server prices the basket from the database
 * and derives the fee via `calculateDeliveryFee`. `voucherCode` is a CODE, not
 * an amount — the server resolves it and computes the discount itself.
 */
export interface CreateOrderInput {
  storeId: string;
  items: CreateOrderItemInput[];
  customerAddressText: string;
  deliveryRegion?: DeliveryRegion;
  addressNote?: string;
  orderNote?: string;
  voucherCode?: string;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  note?: string;
  /** STORE_MANAGER supplies this together with PENDING → ACCEPTED. */
  estimatedPrepMinutes?: number;
}

export interface AssignCaptainInput {
  captainId: string;
}

export interface OrderListQuery extends PaginationQuery {
  status?: OrderStatus;
  storeId?: string;
  captainId?: string;
}

/** A price quote — lets the checkout screen show the fee before committing. */
export interface QuoteOrderInput {
  storeId: string;
  items: CreateOrderItemInput[];
  voucherCode?: string;
  deliveryRegion?: DeliveryRegion;
}

export interface OrderQuote {
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  /** Voucher savings in ILS — 0 when none was applied. */
  discount: number;
  /** Human-readable savings label, e.g. "خصم كوبون / Voucher". */
  discountLabel?: string;
  totalAmount: number;
  currency: string;
  /** `"رسوم التوصيل / Delivery Fee"` — rendered, never hardcoded client-side. */
  deliveryFeeLabel: string;
  /** The resolved voucher, when one was applied. */
  voucher?: {
    code: string;
    labelAr: string;
    labelEn: string;
    discount: number;
  } | null;
}

/**
 * Re-order — clones a past order's basket using CURRENT product prices.
 * The client then loads these into the cart; it never sends money.
 */
export interface ReorderItem {
  product: Product;
  quantity: number;
  note?: string;
}

export interface ReorderResult {
  storeId: string;
  storeNameAr: string;
  items: ReorderItem[];
  /** Products that were dropped because they are no longer available. */
  skipped: number;
}

/** The signed-in customer's favorited stores. */
export interface FavoriteListResult {
  items: Store[];
}

/* ---------------------------------------------------------------------------
 * Convenience aliases for the response bodies
 * ------------------------------------------------------------------------- */

export type OrderDetailResponse = ApiSuccess<OrderDetail>;
export type OrderListResponse = ApiSuccess<Paginated<OrderSummary>>;
export type AuthSuccessResponse = ApiSuccess<AuthResponse>;

/* ---------------------------------------------------------------------------
 * Catalogue management (store manager / admin write operations)
 * ------------------------------------------------------------------------- */

export interface CreateProductInput {
  nameAr: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable?: boolean;
  categoryId?: string;
}

export interface UpdateProductInput {
  nameAr?: string;
  description?: string;
  price?: number;
  imageUrl?: string;
  isAvailable?: boolean;
  categoryId?: string;
}

export interface UpdateStoreInput {
  nameAr?: string;
  nameEn?: string;
  phone?: string;
  logoUrl?: string;
  isActive?: boolean;
  /** Admin-only: flips a store's visibility to the public catalogue. */
  isApproved?: boolean;
}

/* ---------------------------------------------------------------------------
 * User / profile management
 * ------------------------------------------------------------------------- */

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  /** Requires `currentPassword` to be provided when changing password. */
  newPassword?: string;
  currentPassword?: string;
}

export interface UserListQuery extends PaginationQuery {
  role?: UserRole;
  isActive?: boolean;
  search?: string;
}

export interface UpdateUserInput {
  name?: string;
  isActive?: boolean;
  /** Only ADMIN may change roles. */
  role?: UserRole;
  /** Admin flag — captain verification. */
  isVerified?: boolean;
  /** ADMIN-only captain assignment; null returns a captain to the shared pool. */
  assignedStoreId?: string | null;
}

/** PATCH /auth/me/availability — a captain flips their own online/offline state. */
export interface SetAvailabilityInput {
  isAvailable: boolean;
}

/* ---------------------------------------------------------------------------
 * Admin creation — POST /admin/stores & POST /admin/captains
 * ------------------------------------------------------------------------- */

/** POST /admin/stores — admin creates a store plus its manager account. */
export interface AdminCreateStoreInput {
  nameAr: string;
  nameEn: string;
  /** `05XXXXXXXX` — Palestinian mobile. Becomes the manager account's phone. */
  phone: string;
  /** Display name for the STORE_MANAGER account; defaults to `nameAr`. */
  managerName?: string;
  /** Initial availability; defaults to open. */
  isActive?: boolean;
}

/** POST /admin/captains — admin creates a new captain. */
export interface AdminCreateCaptainInput {
  nameAr: string;
  nameEn: string;
  /** `05XXXXXXXX` — Palestinian mobile. */
  phone: string;
  /** The captain's dedicated store. Required. */
  assignedStoreId: string;
  /** Whether the captain may take jobs immediately; defaults to false. */
  isVerified?: boolean;
}

/** Response for POST /admin/stores — the new manager account + store. */
export interface AdminCreateStoreResult {
  user: PublicUser;
  store: Store;
}

/* ---------------------------------------------------------------------------
 * Admin dashboard — GET /admin/stats
 * ------------------------------------------------------------------------- */

/**
 * The single aggregate the admin dashboard renders. One round-trip instead of
 * five screens worth of parallel list queries, because the dashboard only
 * needs counts plus a handful of recent rows.
 */
export interface AdminStats {
  revenue: {
    /** Lifetime takings, excluding CANCELLED orders. */
    total: number;
    /** Takings since server-local midnight, excluding CANCELLED orders. */
    today: number;
  };
  orders: {
    total: number;
    /** Not yet DELIVERED or CANCELLED. */
    active: number;
    byStatus: Record<OrderStatus, number>;
  };
  captains: {
    total: number;
    /** Active captains available to take jobs. */
    online: number;
    verified: number;
  };
  stores: {
    total: number;
    /** Live in the public catalogue. */
    active: number;
    /** Waiting for admin approval. */
    pendingApproval: number;
  };
  users: {
    total: number;
    byRole: Record<UserRole, number>;
  };
  /** The five most recent orders, for the dashboard table. */
  recentOrders: OrderSummary[];
}

/* ---------------------------------------------------------------------------
 * Uploads — POST /uploads/*
 * ------------------------------------------------------------------------- */

/** What a processed image eventually attaches to. */
export type UploadKind = 'user' | 'product' | 'store';

/** POST /uploads/presign */
export interface PresignUploadInput {
  /** Server validate: image/jpeg | image/png | image/webp. */
  contentType: string;
  kind: UploadKind;
  /**
   * Required when `kind === 'product'` or `kind === 'store'` — the product or
   * store the image attaches to.
   */
  resourceId?: string;
}

export interface PresignUploadResult {
  /**
   * PUT target for the raw bytes. For the local storage driver this is a
   * server route the caller reaches with its own bearer token; with the S3
   * driver it is a presigned PUT into the bucket. The caller never builds this
   * URL itself.
   */
  uploadUrl: string;
  /** Server-generated object key — pass it back to `finalize` verbatim. */
  key: string;
  contentType: string;
  /** Hard payload ceiling in bytes; larger bodies are rejected. */
  maxBytes: number;
}

/** POST /uploads/:key/finalize */
export interface FinalizeUploadInput {
  key: string;
  kind: UploadKind;
}

export interface FinalizeUploadResult {
  /** Public, processed URL — cacheable (`Cache-Control: public, max-age=31536000, immutable`). */
  url: string;
  width: number;
  height: number;
}
