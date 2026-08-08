import { z } from 'zod';

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
    // Accept any non-empty phone string — the auth.schemas phoneSchema is
    // intentionally strict for login credentials; store contact numbers are
    // less tightly validated (could be a landline or formatted differently).
    phone: z.string().trim().min(1).max(30).optional(),
    logoUrl: z.string().url().optional().nullable(),
    isActive: z.boolean().optional(),
    /** Admin-only: approving publishes the store to the public catalogue. */
    isApproved: z.boolean().optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'يجب توفير حقل واحد على الأقل للتحديث / At least one field required',
  });

export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
export type UpdateStoreBody = z.infer<typeof updateStoreSchema>;
