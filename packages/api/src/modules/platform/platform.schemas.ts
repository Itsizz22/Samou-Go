import { z } from 'zod';
import { env } from '../../config/env';
import { SettlementMethod } from '@samou-go/shared-types';

function isBannerImageUrl(value: string): boolean {
  if (/^\/banners\/[a-zA-Z0-9._-]+$/.test(value)) return true; // Existing bundled images.
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    // Local development uploads use the configured API origin, never arbitrary HTTP hosts.
    return !env.isProduction && url.origin === new URL(env.publicApiOrigin).origin
      && /^\/uploads\/banner\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9-]+\.webp$/.test(url.pathname);
  } catch { return false; }
}

/** `:orderId` route param — every order-scoped platform endpoint uses it. */
export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1, 'معرّف الطلب مطلوب / orderId is required'),
});

export const walletIdParamsSchema = z.object({
  walletId: z.string().min(1, 'معرّف المحفظة مطلوب / walletId is required'),
});

export const locationSchema = z.object({
  orderId: z.string().min(1).max(100),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  heading: z.number().finite().min(0).lt(360).optional(),
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
  freeDeliveryEnabled: z.boolean().optional(),
  autoPricingEnabled: z.boolean().optional(),
  baseDeliveryFee: z.number().min(0).max(10000).optional(),
  perKmFee: z.number().min(0).max(10000).optional(),
  captainSharePercentage: z.number().min(0).max(100).optional(),
  captainDeliveryRate: z.number().min(0).max(10000).optional(),
  storeCommissionRate: z.number().min(0).max(1).optional(),
  autoAssign: z.boolean().optional(),
  isDriverDynamicFeeEnabled: z.boolean().optional(),
  enableDeliveryZones: z.boolean().optional(),
  requireOtpForSensitiveActions: z.boolean().optional(),
  whatsappSupportNumber: z.string().max(20).nullable().optional(),
  discoveryCategoryIds: z.array(z.string().min(1)).max(500).refine(ids => new Set(ids).size === ids.length).nullable().optional(),
  featuredCategoryIds: z.array(z.string().min(1)).max(500).refine(ids => new Set(ids).size === ids.length).nullable().optional(),
  homeCategories: z.array(z.object({
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), ar: z.string().trim().min(1).max(80), en: z.string().trim().max(80),
    imageUrl: z.string().max(2048).refine(isBannerImageUrl, 'اختر صورة صالحة للفئة').optional(),
    enabled: z.boolean(), storeIds: z.array(z.string().min(1).max(120)).max(500).optional(),
  })).max(60).refine(items => new Set(items.map(item => item.key)).size === items.length, 'الفئات مكررة').optional(),
  homeBanners: z.array(z.object({
    kind: z.enum(['announcement', 'product']).optional(),
    storeId: z.string().min(1).max(120).optional(),
    id: z.string().min(1).max(80), title: z.string().trim().min(1).max(120),
    imageUrl: z.string().max(2048).refine(isBannerImageUrl, 'اختر صورة صالحة للبانر'),
    fit: z.enum(['contain', 'cover']), positionY: z.number().int().min(0).max(100), enabled: z.boolean(),
  }).refine(item => item.kind !== 'product' || Boolean(item.storeId), 'اختر متجر إعلان المنتج')).refine(items => new Set(items.map(item => item.id)).size === items.length, 'معرفات البانرات مكررة').optional(),
  gpsCaptureEnabled: z.boolean().optional(),
  preparationReminderMinutes: z.number().int().min(1).max(30).optional(),
});

export type LocationBody = z.infer<typeof locationSchema>;
export type RatingBody = z.infer<typeof ratingSchema>;
export type ChatBody = z.infer<typeof chatSchema>;
export type TicketBody = z.infer<typeof ticketSchema>;
export type SettlementBody = z.infer<typeof settlementSchema>;
export type WalletCreditBody = z.infer<typeof walletCreditSchema>;
export type PlatformSettingsBody = z.infer<typeof platformSettingsSchema>;
