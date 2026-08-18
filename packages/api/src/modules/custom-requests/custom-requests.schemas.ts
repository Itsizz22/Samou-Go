/**
 * Samou' Go — custom-request (طلب مخصص) request validation.
 *
 * Two routes have a different audience (customer vs store manager), so the two
 * schemas are kept separate even where they share fields — a future change for
 * one should never accidentally leak into the other.
 */

import { z } from 'zod';
import { CustomRequestStatus } from '@samou-go/shared-types';
import { paginationSchema } from '../stores/stores.schemas';

/**
 * POST /customer/custom-requests — the customer describes what they want.
 * `description` is free text; the only hard rule is non-empty + a sane ceiling.
 */
export const createCustomRequestSchema = z.object({
  storeId: z.string().min(1, 'معرّف المتجر مطلوب / storeId is required'),
  description: z
    .string()
    .trim()
    .min(1, 'الوصف مطلوب / Description is required')
    .max(1000, 'الوصف طويل جداً / Description is too long'),
});
export type CreateCustomRequestBody = z.infer<typeof createCustomRequestSchema>;

/** Param schema for `:id` routes. */
export const customRequestIdParamsSchema = z.object({
  id: z.string().min(1, 'معرّف الطلب المخصص مطلوب / request id is required'),
});
export type CustomRequestIdParams = z.infer<typeof customRequestIdParamsSchema>;

/**
 * PATCH /customer/custom-requests/:id/respond — the customer accepts or rejects
 * a `PRICE_OFFERED` request. Only the two terminal-positive states are valid
 * inputs; cancelling mid-flight comes from the customer's account screen.
 */
export const respondCustomRequestSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
});
export type RespondCustomRequestBody = z.infer<typeof respondCustomRequestSchema>;

/**
 * POST /store/custom-requests/:id/offer — the store quotes a price. The server
 * is authoritative on the price currency / precision; we accept whatever the
 * manager typed in ILS, then re-validate in the service layer.
 */
export const offerCustomRequestSchema = z
  .object({
    offeredPrice: z
      .number({ required_error: 'السعر المعروض مطلوب / offered price is required' })
      .positive('السعر يجب أن يكون أكبر من صفر / Price must be positive')
      .finite('السعر يجب أن يكون رقماً / Price must be a number')
      .multipleOf(0.01),
    offerNote: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.offeredPrice !== undefined, {
    message: 'يجب تحديد السعر / Price is required',
  });
export type OfferCustomRequestBody = z.infer<typeof offerCustomRequestSchema>;

/** Listing query for both customer and store endpoints. */
export const customRequestListQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(CustomRequestStatus).optional(),
  /**
   * STORE_MANAGER only: filter by store. The customer endpoint always scopes
   * by `customerId`, so this is ignored for that audience.
   */
  storeId: z.string().min(1).optional(),
});
export type CustomRequestListQuery = z.infer<typeof customRequestListQuerySchema>;
