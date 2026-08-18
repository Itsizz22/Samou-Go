/**
 * Samou' Go — shared enums.
 *
 * These string values are the contract between PostgreSQL (via Prisma), the
 * Express API, and the seven Vite front-ends. They MUST stay byte-identical to
 * the enums declared in `packages/api/prisma/schema.prisma`.
 *
 * They are const objects + union types rather than TypeScript `enum`s on
 * purpose: Prisma generates exactly this shape, so `prismaUser.role` and
 * `UserRole.CUSTOMER` are mutually assignable with no casting. A string `enum`
 * would be nominal and force a cast at every boundary.
 */

/** Who the account belongs to. One role per user. */
export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  STORE_MANAGER: 'STORE_MANAGER',
  CAPTAIN: 'CAPTAIN',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** The lifecycle of an order, in forward order. */
export const OrderStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  ON_THE_WAY: 'ON_THE_WAY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Samou' is a cash economy; COD is the only method live today. */
export const PaymentMethod = {
  COD: 'COD',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** How a voucher's `value` is interpreted. */
export const VoucherDiscountType = {
  /** `value` is a percentage off (0–100). */
  PERCENT: 'PERCENT',
  /** `value` is a fixed amount off, in ILS. */
  FIXED: 'FIXED',
} as const;
export type VoucherDiscountType =
  (typeof VoucherDiscountType)[keyof typeof VoucherDiscountType];

/**
 * Lifecycle of a customer's custom request (طلب مخصص): the customer asks a
 * store for something that isn't in the catalogue, the store replies with a
 * price, and the customer accepts or rejects it.
 */
export const CustomRequestStatus = {
  /** Awaiting a store manager to review and quote a price. */
  PENDING: 'PENDING',
  /** The store quoted a price; the customer may accept or reject. */
  PRICE_OFFERED: 'PRICE_OFFERED',
  /** The customer accepted the quote — fulfilment is manual. */
  ACCEPTED: 'ACCEPTED',
  /** The customer rejected the quote. */
  REJECTED: 'REJECTED',
  /** Closed before fulfilment, by either side. */
  CANCELLED: 'CANCELLED',
} as const;
export type CustomRequestStatus = (typeof CustomRequestStatus)[keyof typeof CustomRequestStatus];

/** Lifecycle of a customer support ticket. */
export const TicketStatus = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

/** How an admin pays out a wallet settlement. */
export const SettlementMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
} as const;
export type SettlementMethod = (typeof SettlementMethod)[keyof typeof SettlementMethod];

/** Type of a wallet ledger movement (earnings in, settlements out). */
export const LedgerEntryType = {
  COMMISSION: 'COMMISSION',
  EARNING: 'EARNING',
  SETTLEMENT: 'SETTLEMENT',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type LedgerEntryType = (typeof LedgerEntryType)[keyof typeof LedgerEntryType];

export const VOUCHER_DISCOUNT_TYPE_LABELS: Record<VoucherDiscountType, { ar: string; en: string }> = {
  [VoucherDiscountType.PERCENT]: { ar: 'نسبة مئوية', en: 'Percent off' },
  [VoucherDiscountType.FIXED]: { ar: 'مبلغ ثابت', en: 'Fixed amount off' },
};

/** Forward-only progression, used to render progress bars and validate jumps. */
export const ORDER_STATUS_SEQUENCE: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.ON_THE_WAY,
  OrderStatus.DELIVERED,
];

/* ---------------------------------------------------------------------------
 * Bilingual labels — Arabic first, matching DESIGN_SYSTEM.md §5
 * ------------------------------------------------------------------------- */

export const USER_ROLE_LABELS: Record<UserRole, { ar: string; en: string }> = {
  [UserRole.CUSTOMER]: { ar: 'عميل', en: 'Customer' },
  [UserRole.STORE_MANAGER]: { ar: 'مدير متجر', en: 'Store Manager' },
  [UserRole.CAPTAIN]: { ar: 'كابتن توصيل', en: 'Delivery Captain' },
  [UserRole.ADMIN]: { ar: 'مشرف', en: 'Admin' },
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, { ar: string; en: string }> = {
  [OrderStatus.PENDING]: { ar: 'بانتظار الموافقة', en: 'Pending' },
  [OrderStatus.ACCEPTED]: { ar: 'تم القبول', en: 'Accepted' },
  [OrderStatus.PREPARING]: { ar: 'قيد التحضير', en: 'Preparing' },
  [OrderStatus.READY_FOR_PICKUP]: { ar: 'جاهز للاستلام', en: 'Ready for pickup' },
  [OrderStatus.ON_THE_WAY]: { ar: 'في الطريق', en: 'On the way' },
  [OrderStatus.DELIVERED]: { ar: 'تم التوصيل', en: 'Delivered' },
  [OrderStatus.CANCELLED]: { ar: 'ملغي', en: 'Cancelled' },
};

/**
 * The design-system tone each status renders with.
 * Maps onto the `badge-*` classes in `src/index.css` (§7.4).
 */
export type StatusTone = 'brand' | 'warning' | 'info' | 'danger' | 'neutral';

export const ORDER_STATUS_TONES: Record<OrderStatus, StatusTone> = {
  [OrderStatus.PENDING]: 'warning',
  [OrderStatus.ACCEPTED]: 'brand',
  [OrderStatus.PREPARING]: 'info',
  [OrderStatus.READY_FOR_PICKUP]: 'info',
  [OrderStatus.ON_THE_WAY]: 'brand',
  [OrderStatus.DELIVERED]: 'brand',
  [OrderStatus.CANCELLED]: 'danger',
};

export const CUSTOM_REQUEST_STATUS_LABELS: Record<
  CustomRequestStatus,
  { ar: string; en: string }
> = {
  [CustomRequestStatus.PENDING]: { ar: 'بانتظار رد المتجر', en: 'Awaiting store reply' },
  [CustomRequestStatus.PRICE_OFFERED]: { ar: 'تم عرض السعر', en: 'Price offered' },
  [CustomRequestStatus.ACCEPTED]: { ar: 'تم القبول', en: 'Accepted' },
  [CustomRequestStatus.REJECTED]: { ar: 'مرفوض', en: 'Rejected' },
  [CustomRequestStatus.CANCELLED]: { ar: 'ملغي', en: 'Cancelled' },
};

export const CUSTOM_REQUEST_STATUS_TONES: Record<CustomRequestStatus, StatusTone> = {
  [CustomRequestStatus.PENDING]: 'warning',
  [CustomRequestStatus.PRICE_OFFERED]: 'brand',
  [CustomRequestStatus.ACCEPTED]: 'brand',
  [CustomRequestStatus.REJECTED]: 'danger',
  [CustomRequestStatus.CANCELLED]: 'neutral',
};

/* ---------------------------------------------------------------------------
 * State machine
 * ------------------------------------------------------------------------- */

/** Statuses from which no further transition is legal. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

/** Every legal `from → to` edge. Anything absent here is rejected by the API. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED],
  [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.ON_THE_WAY, OrderStatus.CANCELLED],
  [OrderStatus.ON_THE_WAY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

/**
 * Which role may move an order INTO a given status.
 * The store owns the kitchen half, the captain owns the road half, and the
 * admin may force any transition. A customer may only cancel.
 */
export const ORDER_STATUS_ACTORS: Record<OrderStatus, readonly UserRole[]> = {
  [OrderStatus.PENDING]: [UserRole.CUSTOMER, UserRole.ADMIN],
  [OrderStatus.ACCEPTED]: [UserRole.STORE_MANAGER, UserRole.ADMIN],
  [OrderStatus.PREPARING]: [UserRole.STORE_MANAGER, UserRole.ADMIN],
  [OrderStatus.READY_FOR_PICKUP]: [UserRole.STORE_MANAGER, UserRole.ADMIN],
  [OrderStatus.ON_THE_WAY]: [UserRole.CAPTAIN, UserRole.ADMIN],
  [OrderStatus.DELIVERED]: [UserRole.CAPTAIN, UserRole.ADMIN],
  [OrderStatus.CANCELLED]: [
    UserRole.CUSTOMER,
    UserRole.STORE_MANAGER,
    UserRole.CAPTAIN,
    UserRole.ADMIN,
  ],
};

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

/** `true` when `from → to` is an edge in the state machine. */
export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

/** `true` when `role` is allowed to drive an order into `status`. */
export function canRoleSetOrderStatus(role: UserRole, status: OrderStatus): boolean {
  return ORDER_STATUS_ACTORS[status].includes(role);
}

/* ---------------------------------------------------------------------------
 * Custom request state machine
 * ------------------------------------------------------------------------- */

export const TERMINAL_CUSTOM_REQUEST_STATUSES: readonly CustomRequestStatus[] = [
  CustomRequestStatus.ACCEPTED,
  CustomRequestStatus.REJECTED,
  CustomRequestStatus.CANCELLED,
];

/**
 * Every legal `from → to` edge. The store owns the PENDING → PRICE_OFFERED
 * edge; the customer owns PRICE_OFFERED → ACCEPTED | REJECTED; a customer may
 * cancel while open, and a store may withdraw an offer by cancelling.
 */
export const CUSTOM_REQUEST_STATUS_TRANSITIONS: Record<
  CustomRequestStatus,
  readonly CustomRequestStatus[]
> = {
  [CustomRequestStatus.PENDING]: [
    CustomRequestStatus.PRICE_OFFERED,
    CustomRequestStatus.CANCELLED,
  ],
  [CustomRequestStatus.PRICE_OFFERED]: [
    CustomRequestStatus.ACCEPTED,
    CustomRequestStatus.REJECTED,
    CustomRequestStatus.CANCELLED,
  ],
  [CustomRequestStatus.ACCEPTED]: [],
  [CustomRequestStatus.REJECTED]: [],
  [CustomRequestStatus.CANCELLED]: [],
};

export function canTransitionCustomRequestStatus(
  from: CustomRequestStatus,
  to: CustomRequestStatus
): boolean {
  return CUSTOM_REQUEST_STATUS_TRANSITIONS[from].includes(to);
}

export function isTerminalCustomRequestStatus(status: CustomRequestStatus): boolean {
  return TERMINAL_CUSTOM_REQUEST_STATUSES.includes(status);
}
