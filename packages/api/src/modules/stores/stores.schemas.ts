import { z } from 'zod';
import { StoreStatus } from '@samou-go/shared-types';

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const storeListQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  /** Public catalogue hides closed shops; an admin dashboard can ask for all. */
  activeOnly: z
    .enum(['true', 'false'])
    .default('true')
    .transform(value => value === 'true'),
});

export const productListQuerySchema = paginationSchema.extend({
  categoryId: z.string().min(1).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  availableOnly: z
    .enum(['true', 'false'])
    .default('true')
    .transform(value => value === 'true'),
});

export const storeIdParamsSchema = z.object({
  storeId: z.string().min(1, 'معرّف المتجر مطلوب / storeId is required'),
});

export type StoreListQuery = z.infer<typeof storeListQuerySchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

/* ---------------------------------------------------------------------------
 * Write schemas — product and store management
 * ------------------------------------------------------------------------- */

export const productIdParamsSchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1, 'معرّف المنتج مطلوب / productId is required'),
});

export const categoryIdParamsSchema = z.object({
  storeId: z.string().min(1),
  categoryId: z.string().min(1, 'معرّف القسم مطلوب / categoryId is required'),
});

/**
 * POST /stores/:storeId/categories — `nameEn` is optional at creation: the
 * service derives a Latin slug (or a unique `cat-…` fallback for Arabic-only
 * names) so the `@@unique([storeId, nameEn])` constraint is always satisfied.
 */
export const createCategorySchema = z.object({
  nameAr: z.string().trim().min(1, 'اسم القسم مطلوب / Section name required').max(120),
  nameEn: z.string().trim().min(1).max(120).optional(),
  imageUrl: z.string().url('رابط الصورة غير صالح / Invalid image URL').optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const updateCategorySchema = z
  .object({
    nameAr: z.string().trim().min(1).max(120).optional(),
    nameEn: z.string().trim().min(1).max(120).optional(),
    imageUrl: z.string().url('رابط الصورة غير صالح / Invalid image URL').nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'يجب توفير حقل واحد على الأقل للتحديث / At least one field required',
  });

export const createProductSchema = z.object({
  nameAr: z.string().trim().min(1, 'اسم المنتج مطلوب').max(160),
  description: z.string().trim().max(1000).optional(),
  price: z
    .number({ required_error: 'السعر مطلوب' })
    .positive('السعر يجب أن يكون أكبر من صفر / Price must be positive')
    .multipleOf(0.01),
  imageUrl: z.string().url('رابط الصورة غير صالح / Invalid image URL').optional(),
  isAvailable: z.boolean().default(true),
  categoryId: z.string().min(1).optional(),
});

export const updateProductSchema = createProductSchema
  .partial()
  .refine(data => Object.keys(data).length > 0, {
    message: 'يجب توفير حقل واحد على الأقل للتحديث / At least one field required',
  });

export const updateStoreSchema = z
  .object({
    nameAr: z.string().trim().min(1).max(160).optional(),
    nameEn: z.string().trim().min(1).max(160).optional(),
    phone: z.string().trim().min(1).max(30).optional(),
    logoUrl: z.string().url().optional().nullable(),
    isActive: z.boolean().optional(),
    /** Admin-only: approving publishes the store to the public catalogue. */
    isApproved: z.boolean().optional(),
    /** Manager instant toggle — customers see "closed" banner. */
    isAcceptingOrders: z.boolean().optional(),
    /** Three-state store status: OPEN, BUSY, CLOSED. */
    storeStatus: z.nativeEnum(StoreStatus).optional(),
    /** Store opening hour (HH:mm). */
    openingTime: z.string().trim().max(5).optional().nullable(),
    /** Store closing hour (HH:mm). */
    closingTime: z.string().trim().max(5).optional().nullable(),
    /** Shopfront GPS — set by the store manager from the location flow. */
    latitude: z
      .number()
      .finite('خط العرض يجب أن يكون رقماً / Latitude must be a number')
      .min(-90, 'خط عرض غير صالح / Invalid latitude')
      .max(90, 'خط عرض غير صالح / Invalid latitude')
      .optional()
      .nullable(),
    longitude: z
      .number()
      .finite('خط الطول يجب أن يكون رقماً / Longitude must be a number')
      .min(-180, 'خط طول غير صالح / Invalid longitude')
      .max(180, 'خط طول غير صالح / Invalid longitude')
      .optional()
      .nullable(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'يجب توفير حقل واحد على الأقل للتحديث / At least one field required',
  });

/** PATCH /stores/:storeId/recommend — ADMIN only, separate route on purpose. */
export const updateStoreRecommendationSchema = z.object({
  isRecommended: z.boolean(),
});

export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
export type UpdateStoreBody = z.infer<typeof updateStoreSchema>;
export type CreateCategoryBody = z.infer<typeof createCategorySchema>;
export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>;
