import type { Offer } from '@samou-go/shared-types';
import type { Prisma } from '../../lib/prisma-types';

/**
 * The row shape every offer query must provide for `toOffer` to typecheck.
 * NOTE: `price` is cast via `(offer as any)` because the Prisma generated
 * client is stale. Remove once `prisma generate` runs successfully.
 */
export type OfferRow = Prisma.OfferGetPayload<{
  include: { products: true; store: { select: { nameAr: true; logoUrl: true; coverUrl: true } } };
}>;

export function toOffer(offer: OfferRow): Offer {
  const raw = offer as any;
  return {
    id: offer.id,
    storeId: offer.storeId,
    storeNameAr: offer.store?.nameAr,
    storeLogoUrl: offer.store?.logoUrl ?? null,
    storeCoverUrl: offer.store?.coverUrl ?? null,
    titleAr: offer.titleAr,
    titleEn: offer.titleEn,
    descriptionAr: offer.descriptionAr,
    descriptionEn: offer.descriptionEn,
    imageUrl: offer.imageUrl,
    price: raw.price != null ? Number(raw.price) : null,
    startsAt: offer.startsAt?.toISOString() ?? null,
    expiresAt: offer.expiresAt?.toISOString() ?? null,
    isActive: offer.isActive,
    productIds: offer.products.map(p => p.productId),
    sortOrder: offer.sortOrder,
    createdAt: offer.createdAt.toISOString(),
  };
}

/** The window predicate — an offer is live while inside its dispatch window. */
export function activeOfferWhere(storeId?: string): Prisma.OfferWhereInput {
  const now = new Date();
  return {
    isActive: true,
    ...(storeId !== undefined ? { storeId } : {}),
    store: { isActive: true, isApproved: true },
    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
  } as Prisma.OfferWhereInput;
}
