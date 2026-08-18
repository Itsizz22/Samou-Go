import type { Offer, Paginated, UserRole } from '@samou-go/shared-types';
import { UserRole as UserRoleEnum } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { forbidden, notFound } from '../../lib/http-error';
import { toOffer, activeOfferWhere, type OfferRow } from './offers.mapper';
import type { CreateOfferBody, UpdateOfferBody } from './offers.schemas';

const INCLUDE_WITH_PRODUCTS = { products: true } as const;

function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

/* ---------------------------------------------------------------------------
 * Ownership gate — mirrors `assertStoreAccess` in the stores module.
 * ------------------------------------------------------------------------- */

async function assertStoreOwner(
  storeId: string,
  userId: string,
  role: UserRole
): Promise<void> {
  if (role === UserRoleEnum.ADMIN) return;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { managerId: true },
  });
  if (!store) throw notFound('المتجر غير موجود / Store not found');
  if (store.managerId !== userId) {
    throw forbidden('هذا المتجر لا يخصّك / This store does not belong to you');
  }
}

/* ---------------------------------------------------------------------------
 * Public queries
 * ------------------------------------------------------------------------- */

/** Active offers within their dispatch window — used by the customer store detail. */
export async function listActiveOffersForStore(
  storeId: string,
  page = 1,
  pageSize = 20
): Promise<Paginated<Offer>> {
  const where = activeOfferWhere(storeId);
  const [rows, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      include: INCLUDE_WITH_PRODUCTS,
      orderBy: { sortOrder: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.offer.count({ where }),
  ]);
  return paginate(rows.map(toOffer), total, page, pageSize);
}

/** Home-screen feed — active offers across all approved + active stores. */
export async function listActiveOffersAllStores(
  page = 1,
  pageSize = 20
): Promise<Paginated<Offer>> {
  const where = activeOfferWhere();
  const [rows, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      include: INCLUDE_WITH_PRODUCTS,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.offer.count({ where }),
  ]);
  return paginate(rows.map(toOffer), total, page, pageSize);
}

/* ---------------------------------------------------------------------------
 * Manager queries — all offers for a store (including inactive / expired)
 * ------------------------------------------------------------------------- */

export async function listAllOffersForStore(
  storeId: string,
  page = 1,
  pageSize = 20
): Promise<Paginated<Offer>> {
  const where = { storeId };
  const [rows, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      include: INCLUDE_WITH_PRODUCTS,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.offer.count({ where }),
  ]);
  return paginate(rows.map(toOffer), total, page, pageSize);
}

/* ---------------------------------------------------------------------------
 * CRUD
 * ------------------------------------------------------------------------- */

export async function createOffer(
  storeId: string,
  body: CreateOfferBody,
  userId: string,
  role: UserRole
): Promise<Offer> {
  await assertStoreOwner(storeId, userId, role);

  const { productIds, ...data } = body as CreateOfferBody & { productIds?: string[] };

  const offer = await prisma.offer.create({
    data: {
      storeId,
      ...data,
      ...(productIds !== undefined
        ? {
            products: {
              create: productIds.map(productId => ({ productId })),
            },
          }
        : {}),
    },
    include: INCLUDE_WITH_PRODUCTS,
  });
  return toOffer(offer);
}

export async function updateOffer(
  storeId: string,
  offerId: string,
  body: UpdateOfferBody,
  userId: string,
  role: UserRole
): Promise<Offer> {
  await assertStoreOwner(storeId, userId, role);

  const existing = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { storeId: true },
  });
  if (!existing) throw notFound('العرض غير موجود / Offer not found');
  if (existing.storeId !== storeId) {
    throw forbidden('العرض لا ينتمي لهذا المتجر / Offer does not belong to this store');
  }

  const { productIds, ...fields } = body as UpdateOfferBody & { productIds?: string[] };

  // Build the update payload — productIds requires a transactional delete+recreate.
  const data: Parameters<typeof prisma.offer.update>[0]['data'] = {
    ...(fields.titleAr !== undefined ? { titleAr: fields.titleAr } : {}),
    ...(fields.titleEn !== undefined ? { titleEn: fields.titleEn } : {}),
    ...(fields.descriptionAr !== undefined ? { descriptionAr: fields.descriptionAr } : {}),
    ...(fields.descriptionEn !== undefined ? { descriptionEn: fields.descriptionEn } : {}),
    ...(fields.startsAt !== undefined ? { startsAt: fields.startsAt } : {}),
    ...(fields.expiresAt !== undefined ? { expiresAt: fields.expiresAt } : {}),
    ...(fields.isActive !== undefined ? { isActive: fields.isActive } : {}),
    ...(fields.sortOrder !== undefined ? { sortOrder: fields.sortOrder } : {}),
  };

  if (productIds !== undefined) {
    const offer = await prisma.$transaction(async tx => {
      await tx.offerProduct.deleteMany({ where: { offerId } });
      if (productIds.length > 0) {
        await tx.offerProduct.createMany({
          data: productIds.map(productId => ({ offerId, productId })),
        });
      }
      return tx.offer.update({
        where: { id: offerId },
        data,
        include: INCLUDE_WITH_PRODUCTS,
      });
    });
    return toOffer(offer);
  }

  const offer = await prisma.offer.update({
    where: { id: offerId },
    data,
    include: INCLUDE_WITH_PRODUCTS,
  });
  return toOffer(offer);
}

export async function deleteOffer(
  storeId: string,
  offerId: string,
  userId: string,
  role: UserRole
): Promise<void> {
  await assertStoreOwner(storeId, userId, role);

  const existing = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { storeId: true },
  });
  if (!existing) throw notFound('العرض غير موجود / Offer not found');
  if (existing.storeId !== storeId) {
    throw forbidden('العرض لا ينتمي لهذا المتجر / Offer does not belong to this store');
  }

  await prisma.offer.delete({ where: { id: offerId } });
}

/** Quick toggle — manager flips the isActive flag. */
export async function toggleOffer(
  storeId: string,
  offerId: string,
  userId: string,
  role: UserRole
): Promise<Offer> {
  await assertStoreOwner(storeId, userId, role);

  const existing = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { storeId: true, isActive: true },
  });
  if (!existing) throw notFound('العرض غير موجود / Offer not found');
  if (existing.storeId !== storeId) {
    throw forbidden('العرض لا ينتمي لهذا المتجر / Offer does not belong to this store');
  }

  const offer = await prisma.offer.update({
    where: { id: offerId },
    data: { isActive: !existing.isActive },
    include: INCLUDE_WITH_PRODUCTS,
  });
  return toOffer(offer);
}