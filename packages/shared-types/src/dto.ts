/**
 * Samou' Go — request / response contracts.
 *
 * Every HTTP body the API accepts or returns is described here, so a front-end
 * can be typed against the API without importing server code.
 */

import type { OrderStatus, UserRole } from './enums';
import type { OrderDetail, OrderSummary, PublicUser } from './models';

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
}

/**
 * Note what is NOT here: `subtotal`, `deliveryFee`, `totalAmount`.
 * The client never sends money. The server prices the basket from the database
 * and derives the fee via `calculateDeliveryFee`.
 */
export interface CreateOrderInput {
  storeId: string;
  items: CreateOrderItemInput[];
  customerAddressText: string;
  addressNote?: string;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  note?: string;
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
}

export interface OrderQuote {
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  currency: string;
  /** `"رسوم التوصيل / Delivery Fee"` — rendered, never hardcoded client-side. */
  deliveryFeeLabel: string;
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
}
