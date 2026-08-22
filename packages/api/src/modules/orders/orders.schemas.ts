import { z } from 'zod';
import { OrderStatus } from '@samou-go/shared-types';
import { paginationSchema } from '../stores/stores.schemas';

/**
 * Case-insensitive enum coercion for query strings. Express delivers query
 * params as lowercase strings; `z.nativeEnum` is case-sensitive, so
 * `?status=pending` would fail against `OrderStatus.PENDING`.
 */
const caseInsensitiveOrderStatus = z
  .string()
  .transform((val) => val.toUpperCase())
  .pipe(z.nativeEnum(OrderStatus));

export const modifierOptionSchema = z.object({
  key: z.string().min(1, 'مفتاح الخيار مطلوب / option key is required'),
  labelAr: z.string().min(1, 'اسم الخيار بالعربية مطلوب / Arabic label is required'),
  labelEn: z.string().min(1, 'English label is required'),
  // Informational only. This value is CLIENT-SUPPLIED, so the server never adds
  // it to the unit price — money is priced from the products table, and trusting
  // a client delta would reopen the "buy a fridge for 1 ₪" hole. If modifiers
  // must affect price, they need a DB-backed catalogue (admin-owned) first.
  priceDelta: z.number().finite('سعر التعديل يجب أن يكون رقماً / price delta must be a number'),
});

export const modifierGroupSchema = z.object({
  labelAr: z.string().min(1, 'اسم المجموعةRequired / Group name is required'),
  labelEn: z.string().min(1, 'Group English label is required'),
  options: z.array(modifierOptionSchema).min(1, 'يجب توفر خيار على الأقل / At least one option required'),
});

export const orderItemInputSchema = z.object({
  productId: z.string().min(1, 'معرّف المنتج مطلوب / productId is required'),
  quantity: z
    .number()
    .int('الكمية يجب أن تكون رقماً صحيحاً / Quantity must be a whole number')
    .positive('الكمية يجب أن تكون أكبر من صفر / Quantity must be greater than zero')
    .max(99, 'الحد الأقصى 99 لكل منتج / Maximum 99 per product'),
  note: z.string().trim().max(500).optional(),
  modifiers: z.array(modifierGroupSchema).optional(),
});

/**
 * Note what the client may NOT send: subtotal, deliveryFee, totalAmount.
 * The server prices the basket from the database. Accepting money from the
 * client would let anyone order a fridge for 1 ₪. A `voucherCode` is a CODE,
 * not an amount — the server resolves it and computes the discount.
 */
export const voucherCodeField = z.string().trim().min(1).max(40).optional();

export const createOrderSchema = z.object({
  storeId: z.string().min(1, 'معرّف المتجر مطلوب / storeId is required'),
  items: z
    .array(orderItemInputSchema)
    .min(1, 'السلة فارغة / The basket is empty')
    .max(60, 'عدد المنتجات كبير جداً / Too many distinct products'),
  customerAddressText: z
    .string()
    .trim()
    .min(5, 'العنوان قصير جداً / Address is too short')
    .max(500),
  deliveryRegion: z.enum(['central', 'outer', 'remote']).optional(),
  addressNote: z.string().trim().max(500).optional(),
  orderNote: z.string().trim().max(500).optional(),
  deliveryPreset: z.string().trim().max(50).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  voucherCode: voucherCodeField,
});

/** Same body as create, minus the address — used to preview the delivery fee. */
export const quoteOrderSchema = createOrderSchema.pick({
  storeId: true,
  items: true,
  voucherCode: true,
  deliveryRegion: true,
});

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  note: z.string().trim().max(500).optional(),
  estimatedPrepMinutes: z.number().int().min(5).max(180).optional(),
});

/** Rating and comment for an order review. */
export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5, 'التقييم يجب أن يكون من 1 إلى 5 / Rating must be between 1 and 5'),
  comment: z.string().trim().max(500).optional(),
});

export const assignCaptainSchema = z.object({
  captainId: z.string().min(1, 'معرّف الكابتن مطلوب / captainId is required'),
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1, 'معرّف الطلب مطلوب / orderId is required'),
});

export const orderListQuerySchema = paginationSchema.extend({
  status: caseInsensitiveOrderStatus.optional(),
  storeId: z.string().min(1).optional(),
  captainId: z.string().min(1).optional(),
});

/** PATCH /orders/:orderId/set-delivery-fee — driver sets a custom delivery fee (when dynamic fee mode is enabled). */
export const setDeliveryFeeSchema = z.object({
  deliveryFee: z.number().min(0).max(1000, 'رسوم التوصيل يجب أن تكون بين 0 و 1000 ₪ / Delivery fee must be between 0 and 1000 ₪'),
});

/**
 * Multi-store cart checkout — one API call splits a multi-store basket into
 * independent sub-orders, each with its own pricing, delivery fee, and
 * state machine. All sub-orders share the same `cartCheckoutId` for grouped
 * display. Vouchers are NOT supported in multi-store checkout (each sub-order
 * is fully independent; applying a voucher across stores creates ambiguous
 * redemption semantics).
 */
const storeCheckoutItemSchema = z.object({
  storeId: z.string().min(1, 'معرّف المتجر مطلوب / storeId is required'),
  items: z
    .array(orderItemInputSchema)
    .min(1, 'السلة فارغة / The basket is empty')
    .max(60, 'عدد المنتجات كبير جداً / Too many distinct products'),
});

export const checkoutSchema = z.object({
  cartCheckoutId: z.string().min(1).optional(),
  stores: z
    .array(storeCheckoutItemSchema)
    .min(2, 'يتطلب سلة متعددة المتاجر / Multi-store cart requires at least 2 stores')
    .max(10, 'حد أقصى 10 متاجر / Maximum 10 stores'),
  customerAddressText: z
    .string()
    .trim()
    .min(5, 'العنوان قصير جداً / Address is too short')
    .max(500),
  deliveryRegion: z.enum(['central', 'outer', 'remote']).optional(),
  addressNote: z.string().trim().max(500).optional(),
  orderNote: z.string().trim().max(500).optional(),
  deliveryPreset: z.string().trim().max(50).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/** Individual store result within a multi-store checkout. */
export interface CheckoutStoreResult {
  storeId: string;
  orderId: string;
  orderNumber: string;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  itemCount: number;
}

/** Full response of POST /orders/checkout. */
export interface CheckoutResult {
  cartCheckoutId: string;
  orders: CheckoutStoreResult[];
  grandTotal: number;
  totalDeliveryFee: number;
  totalItemCount: number;
}

export type CreateOrderBody = z.infer<typeof createOrderSchema>;
export type QuoteOrderBody = z.infer<typeof quoteOrderSchema>;
export type CheckoutBody = z.infer<typeof checkoutSchema>;
export type UpdateOrderStatusBody = z.infer<typeof updateOrderStatusSchema>;
export type AssignCaptainBody = z.infer<typeof assignCaptainSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type SetReviewBody = z.infer<typeof reviewSchema>;
export type SetDeliveryFeeBody = z.infer<typeof setDeliveryFeeSchema>;
