import { z } from 'zod';

/** Optional dispatch window — ISO-8601 datetimes, or null to clear. */
export const offerWindowField = z
  .string()
  .datetime({ offset: true, message: 'تاريخ غير صالح / Invalid datetime' })
  .optional()
  .nullable();

export const createOfferSchema = z.object({
  titleAr: z.string().trim().min(1, 'عنوان العرض بالعربية مطلوب / Arabic title is required').max(160),
  titleEn: z.string().trim().min(1, 'English title is required').max(160),
  descriptionAr: z.string().trim().min(1, 'وصف العرض بالعربية مطلوب / Arabic description is required').max(500),
  descriptionEn: z.string().trim().min(1, 'English description is required').max(500),
  startsAt: offerWindowField,
  expiresAt: offerWindowField,
  isActive: z.boolean().optional(),
  /** Targeted product IDs — omit or empty array = store-wide. */
  productIds: z.array(z.string().min(1)).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const updateOfferSchema = createOfferSchema
  .partial()
  .refine(data => Object.keys(data).length > 0, {
    message: 'يجب توفير حقل واحد على الأقل للتحديث / At least one field required',
  });

export const offerIdParamsSchema = z.object({
  offerId: z.string().min(1, 'معرّف العرض مطلوب / offerId is required'),
});

export type CreateOfferBody = z.infer<typeof createOfferSchema>;
export type UpdateOfferBody = z.infer<typeof updateOfferSchema>;