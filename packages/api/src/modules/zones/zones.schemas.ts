import { z } from 'zod';

/** Fee must be a sane ILS amount — non-negative, capped to avoid overflow. */
export const zoneFeeSchema = z
  .number()
  .finite('الرسوم يجب أن تكون رقماً / Fee must be a number')
  .min(0, 'الرسوم لا يمكن أن تكون سالبة / Fee cannot be negative')
  .max(10_000, 'رسوم غير معقولة / Fee is unreasonably large');

export const createDeliveryZoneSchema = z.object({
  nameAr: z.string().trim().min(1, 'اسم المنطقة بالعربية مطلوب / Arabic name is required').max(160),
  nameEn: z.string().trim().min(1, 'English name is required').max(160),
  fee: zoneFeeSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const updateDeliveryZoneSchema = createDeliveryZoneSchema
  .partial()
  .refine(body => Object.keys(body).length > 0, {
    message: 'لا شيء للتحديث / Nothing to update',
  });

export const zoneIdParamsSchema = z.object({
  zoneId: z.string().min(1, 'معرّف المنطقة مطلوب / zoneId is required'),
});

/** PATCH /orders/:orderId/delivery-zone — the captain picks the ZONE, not a fee. */
export const setOrderDeliveryZoneSchema = z.object({
  zoneId: z.string().min(1, 'معرّف المنطقة مطلوب / zoneId is required'),
});

export type CreateDeliveryZoneBody = z.infer<typeof createDeliveryZoneSchema>;
export type UpdateDeliveryZoneBody = z.infer<typeof updateDeliveryZoneSchema>;
export type SetOrderDeliveryZoneBody = z.infer<typeof setOrderDeliveryZoneSchema>;