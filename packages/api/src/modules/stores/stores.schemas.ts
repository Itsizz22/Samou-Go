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
