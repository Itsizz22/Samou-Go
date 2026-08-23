import { z } from 'zod';
import { SettlementMethod } from '@samou-go/shared-types';

/** `:orderId` route param — every order-scoped platform endpoint uses it. */
export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1, 'معرّف الطلب مطلوب / orderId is required'),
});

export const walletIdParamsSchema = z.object({
  walletId: z.string().min(1, 'معرّف المحفظة مطلوب / walletId is required'),
});

export const locationSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  heading: z.number().finite().optional(),
});

export const ratingSchema = z.object({
  storeRating: z.number().int().min(1).max(5),
  captainRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
});

export const chatSchema = z.object({ message: z.string().trim().min(1).max(2000) });

export const ticketSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
});

const settlementMethodSchema = z.enum(
  Object.values(SettlementMethod) as [SettlementMethod, ...SettlementMethod[]]
);

export const settlementSchema = z.object({
  amount: z.number().positive(),
  method: settlementMethodSchema,
  note: z.string().max(500).optional(),
});

/** Admin manual top-up. Positive amounts only — corrections belong to settlements. */
export const walletCreditSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(500).optional(),
});

/** PATCH /platform/settings — platform-wide economy knobs (admin only). */
export const platformSettingsSchema = z.object({
  captainDeliveryRate: z.number().min(0).max(10000).optional(),
  storeCommissionRate: z.number().min(0).max(1).optional(),
  autoAssign: z.boolean().optional(),
  isDriverDynamicFeeEnabled: z.boolean().optional(),
  requireOtpForSensitiveActions: z.boolean().optional(),
  whatsappSupportNumber: z.string().max(20).nullable().optional(),
});

export type LocationBody = z.infer<typeof locationSchema>;
export type RatingBody = z.infer<typeof ratingSchema>;
export type ChatBody = z.infer<typeof chatSchema>;
export type TicketBody = z.infer<typeof ticketSchema>;
export type SettlementBody = z.infer<typeof settlementSchema>;
export type WalletCreditBody = z.infer<typeof walletCreditSchema>;
export type PlatformSettingsBody = z.infer<typeof platformSettingsSchema>;
