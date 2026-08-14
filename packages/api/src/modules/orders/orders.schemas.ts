import { z } from 'zod';
import { OrderStatus } from '@samou-go/shared-types';
import { paginationSchema } from '../stores/stores.schemas';

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

export const assignCaptainSchema = z.object({
  captainId: z.string().min(1, 'معرّف الكابتن مطلوب / captainId is required'),
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1, 'معرّف الطلب مطلوب / orderId is required'),
});

export const orderListQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(OrderStatus).optional(),
  storeId: z.string().min(1).optional(),
  captainId: z.string().min(1).optional(),
});

export type CreateOrderBody = z.infer<typeof createOrderSchema>;
export type QuoteOrderBody = z.infer<typeof quoteOrderSchema>;
export type UpdateOrderStatusBody = z.infer<typeof updateOrderStatusSchema>;
export type AssignCaptainBody = z.infer<typeof assignCaptainSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
