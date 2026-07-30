import { z } from 'zod';
import { OrderStatus } from '@samou-go/shared-types';
import { paginationSchema } from '../stores/stores.schemas';

export const orderItemInputSchema = z.object({
  productId: z.string().min(1, 'معرّف المنتج مطلوب / productId is required'),
  quantity: z
    .number()
    .int('الكمية يجب أن تكون رقماً صحيحاً / Quantity must be a whole number')
    .positive('الكمية يجب أن تكون أكبر من صفر / Quantity must be greater than zero')
    .max(99, 'الحد الأقصى 99 لكل منتج / Maximum 99 per product'),
});

/**
 * Note what the client may NOT send: subtotal, deliveryFee, totalAmount.
 * The server prices the basket from the database. Accepting money from the
 * client would let anyone order a fridge for 1 ₪.
 */
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
  addressNote: z.string().trim().max(500).optional(),
});

/** Same body as create, minus the address — used to preview the delivery fee. */
export const quoteOrderSchema = createOrderSchema.pick({ storeId: true, items: true });

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  note: z.string().trim().max(500).optional(),
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
