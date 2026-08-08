import { z } from 'zod';

export const favoriteStoreIdParamsSchema = z.object({
  storeId: z.string().min(1, 'معرّف المتجر مطلوب / storeId is required'),
});

export type FavoriteStoreIdParams = z.infer<typeof favoriteStoreIdParamsSchema>;
