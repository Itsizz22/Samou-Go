import { validateProductDiscount } from './product-discount';
import { dishProductIds } from './dish-stores';
import { deliveryEstimates } from './delivery-estimates';
import type { Prisma } from '../../lib/prisma-types';
import type {
  Category,
  JwtPayload,
  Paginated,
  Product,
  PopularProduct,
  Store,
  StoreWithCatalogue,
  UserRole,
} from '@samou-go/shared-types';
import { UserRole as UserRoleEnum, generateStoreSlug } from '@samou-go/shared-types';
import { prisma, caseInsensitiveContains } from '../../lib/prisma';
import { conflict, forbidden, notFound } from '../../lib/http-error';
import { toProduct, toStore, toStoreWithCatalogue } from './stores.mapper';
import type {
  CreateCategoryBody,
  CreateProductBody,
  ProductListQuery,
  StoreListQuery,
  UpdateCategoryBody,
  UpdateProductBody,
  UpdateStoreBody,
} from './stores.schemas';

function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

/**
 * Whether the caller may see shops that are closed (`isActive: false`) or
 * unapproved. Only staff who need the operational view (admin approval
 * workflow, store manager dashboard) get it — customers and anonymous
 * visitors must never see a disabled store, no matter what `activeOnly` says.
 */
function canSeeInactiveStores(auth: JwtPayload | null): boolean {
  return (
    auth !== null &&
    (auth.role === UserRoleEnum.ADMIN || auth.role === UserRoleEnum.STORE_MANAGER)
  );
}

/* ---------------------------------------------------------------------------
 * Smart Store Badges
 * ------------------------------------------------------------------------- */

/**
 * Compute badges for a batch of stores:
 * - badge_popular: highest completed order count in last 30 days
 * - badge_fast: average prep time under 20 minutes
 * - badge_has_offers: has at least one active standalone offer
 */
async function computeStoreBadges(storeIds: string[]): Promise<Map<string, string[]>> {
  if (storeIds.length === 0) return new Map();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [completedOrders, avgPrepTimes, activeOffers] = await Promise.all([
    // Count completed orders per store in last 30 days
    prisma.order.groupBy({
      by: ['storeId'],
      where: {
        storeId: { in: storeIds },
        status: 'DELIVERED',
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: { id: true },
    }),
    // Average estimated prep time per store
    prisma.order.groupBy({
      by: ['storeId'],
      where: {
        storeId: { in: storeIds },
        estimatedPrepMinutes: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      _avg: { estimatedPrepMinutes: true },
    }),
    // Stores with at least one active standalone offer (price > 0)
    prisma.offer.groupBy({
      by: ['storeId'],
      where: {
        storeId: { in: storeIds },
        isActive: true,
        price: { gt: 0 },
      },
    }),
  ]);

  // Find the max order count to determine "popular"
  const maxOrders = Math.max(0, ...completedOrders.map(r => r._count.id));
  const popularThreshold = Math.max(5, maxOrders * 0.7); // at least 5 orders or top 30%

  const orderCountMap = new Map(completedOrders.map(r => [r.storeId, r._count.id]));
  const prepTimeMap = new Map(avgPrepTimes.map(r => [r.storeId, r._avg.estimatedPrepMinutes]));
  const offersSet = new Set(activeOffers.map(r => r.storeId));

  const result = new Map<string, string[]>();
  for (const id of storeIds) {
    const badges: string[] = [];
    if ((orderCountMap.get(id) ?? 0) >= popularThreshold) badges.push('badge_popular');
    if ((prepTimeMap.get(id) ?? 999) < 20) badges.push('badge_fast');
    if (offersSet.has(id)) badges.push('badge_has_offers');
    result.set(id, badges);
  }
  return result;
}

/* ---------------------------------------------------------------------------
 * Public reads
 * ------------------------------------------------------------------------- */

export async function listStores(
  query: StoreListQuery,
  auth: JwtPayload | null = null
): Promise<Paginated<Store>> {
  // `isApproved: true` is the public catalogue. An admin asking for the full
  // set (`activeOnly: false`) sees unapproved stores too, so the approval
  // workflow can list them for review. Customers are always pinned to live,
  // approved shops.
  const canSeeInactive = canSeeInactiveStores(auth) && !query.activeOnly;
  const isAdminFullList = auth?.role === UserRoleEnum.ADMIN && !query.activeOnly;
  const where: Prisma.StoreWhereInput = {
    ...(isAdminFullList ? {} : { isApproved: true }),
    // `activeOnly` only relaxes the filter for staff. Customers are always
    // pinned to live, approved shops — a disabled store is invisible to them.
    ...(canSeeInactive ? {} : { isActive: true, storeStatus: { not: 'CLOSED' } }),
    ...(query.storeType ? { storeType: query.storeType } : {}),
    ...(query.search
      ? {
          OR: [
            { nameAr: caseInsensitiveContains(query.search) },
            { nameEn: caseInsensitiveContains(query.search) },
            { publicCode: caseInsensitiveContains(query.search) },
          ],
        }
      : {}),
  };

  if (query.sort) return listDiscoveryStores(query, where);

  const [rows, total] = await Promise.all([
    prisma.store.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.store.count({ where }),
  ]);

  // Compute smart badges for each store (only for customer-facing lists).
  const storeIds = rows.map(r => r.id);
  const [badgesMap, estimates] = await Promise.all([computeStoreBadges(storeIds), deliveryEstimates(storeIds)]);

  return paginate(
    rows.map(r => ({ ...toStore(r), deliveryEstimate: estimates.get(r.id) ?? null, badges: badgesMap.get(r.id) ?? [] })),
    total,
    query.page,
    query.pageSize,
  );
}

/**
 * GET /stores/mine — every store this STORE_MANAGER account manages.
 * Auth-gated replacement for the old "list all stores and match managerId"
 * trick, which silently failed whenever the manager's store was not the first
 * page of the public catalogue.
 */
export async function listManagedStores(managerId: string): Promise<Store[]> {
  const rows = await prisma.store.findMany({
    where: { managerId },
    orderBy: { nameAr: 'asc' },
  });
  return rows.map(toStore);
}

/** One store with its whole menu — what the Store Details screen loads. */
export async function getStoreWithCatalogue(storeId: string): Promise<StoreWithCatalogue> {
  const store = await (prisma.store.findUnique as any)({
    where: { id: storeId },
    include: {
      categories: {
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        include: {
          products: {
            where: { isAvailable: true },
            orderBy: { nameAr: 'asc' },
            include: {
              optionGroups: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  items: { orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!store) throw notFound('المتجر غير موجود / Store not found');
  if (!store.isActive || !store.isApproved) {
    throw notFound('المتجر غير موجود / Store not found');
  }

  const estimates = await deliveryEstimates([storeId]);
  return { ...toStoreWithCatalogue(store as any), deliveryEstimate: estimates.get(storeId) ?? null };
}

/**
 * One store with its COMPLETE catalogue — all products regardless of
 * availability. Used by the store manager dashboard so the manager can
 * re-enable a product they previously marked unavailable.
 * Never called from public-facing routes.
 */
export async function getStoreWithFullCatalogue(storeId: string): Promise<StoreWithCatalogue> {
  const store = await (prisma.store.findUnique as any)({
    where: { id: storeId },
    include: {
      dedicatedCaptains: {
        where: { role: UserRoleEnum.CAPTAIN },
        select: { id: true, name: true, phone: true, isAvailable: true, isVerified: true },
      },
      categories: {
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        include: {
          products: {
            orderBy: { nameAr: 'asc' },
            include: {
              optionGroups: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  items: { orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!store) throw notFound('المتجر غير موجود / Store not found');

  const estimates = await deliveryEstimates([storeId]);
  return { ...toStoreWithCatalogue(store as any), deliveryEstimate: estimates.get(storeId) ?? null };
}

export async function listStoreProducts(
  storeId: string,
  query: ProductListQuery
): Promise<Paginated<Product>> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw notFound('المتجر غير موجود / Store not found');

  const where: Prisma.ProductWhereInput = {
    storeId,
    ...(query.availableOnly ? { isAvailable: true } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search ? { nameAr: caseInsensitiveContains(query.search) } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { nameAr: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return paginate(rows.map(toProduct), total, query.page, query.pageSize);
}

/* ---------------------------------------------------------------------------
 * Ownership guard
 * ------------------------------------------------------------------------- */

/**
 * Asserts that `userId` manages `storeId`, or that the caller is an ADMIN.
 * Throws 403/404 otherwise.
 */
export async function assertStoreAccess(
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
 * Write operations
 * ------------------------------------------------------------------------- */

/** PATCH /stores/:storeId */
export async function updateStore(storeId: string, body: UpdateStoreBody): Promise<Store> {
  const existing = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!existing) throw notFound('المتجر غير موجود / Store not found');

  if (body.deliveryZoneId && !await prisma.deliveryZone.findFirst({ where: { id: body.deliveryZoneId, isActive: true } })) throw notFound("منطقة المتجر غير متاحة");
  const updated = await prisma.store.update({
    where: { id: storeId },
    data: {
      ...(body.nameAr !== undefined ? { nameAr: body.nameAr, slug: generateStoreSlug(body.nameAr) } : {}),
      ...(body.nameEn !== undefined ? { nameEn: body.nameEn } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.deliveryZoneId !== undefined ? { deliveryZoneId: body.deliveryZoneId } : {}),
      ...(body.whatsappNumber !== undefined ? { whatsappNumber: body.whatsappNumber } : {}),
      ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.isApproved !== undefined ? { isApproved: body.isApproved } : {}),
      ...(body.isAcceptingOrders !== undefined ? { isAcceptingOrders: body.isAcceptingOrders } : {}),
      ...(body.storeStatus !== undefined ? { storeStatus: body.storeStatus } : {}),
      ...(body.storeType !== undefined ? { storeType: body.storeType } : {}),
      ...(body.openingTime !== undefined ? { openingTime: body.openingTime } : {}),
      ...(body.closingTime !== undefined ? { closingTime: body.closingTime } : {}),
      ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
      ...(body.longitude !== undefined ? { longitude: body.longitude } : {}),
    },
  });
  return toStore(updated);
}

/** PATCH /stores/:storeId/approve — admin clears a new store into the catalogue. */
export async function approveStore(storeId: string): Promise<Store> {
  const existing = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!existing) throw notFound('المتجر غير موجود / Store not found');

  const updated = await prisma.store.update({
    where: { id: storeId },
    data: { isApproved: true },
  });
  return toStore(updated);
}

/** PATCH /stores/:storeId/recommend — admin flags a store for the badge. */
export async function setStoreRecommended(storeId: string, isRecommended: boolean): Promise<Store> {
  const existing = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!existing) throw notFound('المتجر غير موجود / Store not found');

  const updated = await prisma.store.update({
    where: { id: storeId },
    data: { isRecommended },
  });
  return toStore(updated);
}

/** POST /stores/:storeId/products */
export async function createProduct(
  storeId: string,
  body: CreateProductBody
): Promise<Product> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw notFound('المتجر غير موجود / Store not found');

  if (body.categoryId) {
    const cat = await prisma.category.findUnique({
      where: { id: body.categoryId },
      select: { storeId: true },
    });
    if (!cat || cat.storeId !== storeId) {
      throw notFound('القسم غير موجود في هذا المتجر / Category not found in this store');
    }
  }

  validateProductDiscount(body.price, body.originalPrice);
  const product = await prisma.product.create({
    data: {
      nameAr: body.nameAr,
      description: body.description ?? null,
      price: body.price,
      originalPrice: body.originalPrice ?? null,
      imageUrl: body.imageUrl ?? null,
      isAvailable: body.isAvailable ?? true,
      categoryId: body.categoryId ?? null,
      storeId,
    },
  });
  return toProduct(product);
}

/** PATCH /stores/:storeId/products/:productId */
export async function updateProduct(
  storeId: string,
  productId: string,
  body: UpdateProductBody
): Promise<Product> {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { storeId: true, price: true, originalPrice: true },
  });
  if (!existing) throw notFound('المنتج غير موجود / Product not found');
  if (existing.storeId !== storeId) {
    throw forbidden('المنتج لا ينتمي لهذا المتجر / Product does not belong to this store');
  }

  if (body.categoryId !== undefined && body.categoryId !== null) {
    const cat = await prisma.category.findUnique({
      where: { id: body.categoryId },
      select: { storeId: true },
    });
    if (!cat || cat.storeId !== storeId) {
      throw notFound('القسم غير موجود في هذا المتجر / Category not found in this store');
    }
  }

  validateProductDiscount(body.price ?? Number(existing.price), body.originalPrice !== undefined ? body.originalPrice : existing.originalPrice == null ? null : Number(existing.originalPrice));
  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.originalPrice !== undefined ? { originalPrice: body.originalPrice } : {}),
      ...(body.price !== undefined ? { price: body.price } : {}),
      ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
      ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
      ...(body.optionsEnabled !== undefined ? { optionsEnabled: body.optionsEnabled } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
    },
  });
  return toProduct(updated);
}

/** DELETE /stores/:storeId/products/:productId — soft-deactivates the product.
 *  Hard delete is intentionally avoided: OrderItem references products with
 *  `onDelete: Restrict`, so a hard delete of any product with orders would
 *  fail at the DB layer anyway.
 */
export async function deactivateProduct(storeId: string, productId: string): Promise<Product> {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { storeId: true },
  });
  if (!existing) throw notFound('المنتج غير موجود / Product not found');
  if (existing.storeId !== storeId) {
    throw forbidden('المنتج لا ينتمي لهذا المتجر / Product does not belong to this store');
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { isAvailable: false },
  });
  return toProduct(updated);
}

/* ---------------------------------------------------------------------------
 * Categories (menu sections)
 * ------------------------------------------------------------------------- */

/**
 * Transliterate a name into a Latin slug for the `nameEn` column, which the
 * `@@unique([storeId, nameEn])` constraint requires to be unique per store.
 * Arabic-only names slugify to `''` — the caller falls back to a `cat-…` id.
 */
function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** POST /stores/:storeId/categories */
export async function createCategory(storeId: string, body: CreateCategoryBody): Promise<Category> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw notFound('المتجر غير موجود / Store not found');

  const base = body.nameEn?.trim() || slugify(body.nameAr) || `cat-${crypto.randomUUID().slice(0, 8)}`;
  let nameEn = base;
  // `@@unique([storeId, nameEn])` — bump the slug on collision ("مشروبات" and
  // a second Arabic-only name both slugify to the same fallback).
  for (let attempt = 2; attempt <= 5; attempt++) {
    const dup = await prisma.category.findUnique({
      where: { storeId_nameEn: { storeId, nameEn } },
      select: { id: true },
    });
    if (!dup) break;
    nameEn = `${base}-${attempt}`;
  }

  const category = await prisma.category.create({
    data: {
      nameAr: body.nameAr,
      nameEn,
      imageUrl: body.imageUrl ?? null,
      storeId,
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return {
    id: category.id,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    imageUrl: category.imageUrl ?? null,
    storeId: category.storeId,
    sortOrder: category.sortOrder,
  };
}

/**
 * PATCH /stores/:storeId/categories/:categoryId — rename (Arabic and/or the
 * Latin slug) and/or reorder (`sortOrder`). Colliding `nameEn` values are
 * rejected with a 409 before Prisma's P2002 can fire.
 */
export async function updateCategory(
  storeId: string,
  categoryId: string,
  body: UpdateCategoryBody
): Promise<Category> {
  const existing = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { storeId: true, nameAr: true, nameEn: true },
  });
  if (!existing) throw notFound('القسم غير موجود / Category not found');
  if (existing.storeId !== storeId) {
    throw forbidden('القسم لا ينتمي لهذا المتجر / Category does not belong to this store');
  }

  const data: Prisma.CategoryUpdateInput = {};
  if (body.nameAr !== undefined) data.nameAr = body.nameAr;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
  let nextNameEn: string | undefined;
  if (body.nameEn !== undefined) {
    nextNameEn = body.nameEn.trim() || slugify(body.nameAr ?? existing.nameAr) || existing.nameEn;
    data.nameEn = nextNameEn;
  }

  if (nextNameEn !== undefined && nextNameEn !== existing.nameEn) {
    const dup = await prisma.category.findUnique({
      where: { storeId_nameEn: { storeId, nameEn: nextNameEn } },
      select: { id: true },
    });
    if (dup) {
      throw conflict('اسم القسم مستخدم مسبقاً / This section name is already in use');
    }
  }

  const category = await prisma.category.update({ where: { id: categoryId }, data });
  return {
    id: category.id,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    imageUrl: category.imageUrl ?? null,
    storeId: category.storeId,
    sortOrder: category.sortOrder,
  };
}

/**
 * DELETE /stores/:storeId/categories/:categoryId — products in the section are
 * unlinked (`categoryId → null`, never deleted) and the section itself is
 * removed.
 */
export async function deleteCategory(storeId: string, categoryId: string): Promise<{ removed: boolean }> {
  const existing = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { storeId: true },
  });
  if (!existing) throw notFound('القسم غير موجود / Category not found');
  if (existing.storeId !== storeId) {
    throw forbidden('القسم لا ينتمي لهذا المتجر / Category does not belong to this store');
  }

  await prisma.$transaction([
    prisma.product.updateMany({
      where: { storeId, categoryId },
      data: { categoryId: null },
    }),
    prisma.category.delete({ where: { id: categoryId } }),
  ]);
  return { removed: true };
}

/* ---------------------------------------------------------------------------
 * Popular / best-selling products
 * ------------------------------------------------------------------------- */

/** Best sellers are the existing data signal for the featured showcase. */
export async function getPopularProducts(limit = 12, storeId?: string): Promise<PopularProduct[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      order: { status: 'DELIVERED', createdAt: { gt: since } },
      product: { ...(storeId ? { storeId } : {}), isAvailable: true, store: { isActive: true, isApproved: true } },
    },
    _sum: { quantity: true },
    orderBy: [{ _sum: { quantity: 'desc' } }, { productId: 'asc' }],
    take: Math.max(1, Math.min(24, limit)),
  });
  const ids = rows.flatMap(row => row.productId ? [row.productId] : []);
  if (!ids.length) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isAvailable: true, store: { isActive: true, isApproved: true } },
    include: {
      store: { select: { nameAr: true, logoUrl: true } },
      optionGroups: { orderBy: { sortOrder: 'asc' }, include: { items: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } },
    },
  });
  const productsById = new Map(products.map(product => [product.id, product]));
  return rows.flatMap(row => {
    const raw = row.productId ? productsById.get(row.productId) : undefined;
    if (!raw) return [];
    const product = toProduct(raw);
    return [{ ...product, storeNameAr: raw.store.nameAr, storeLogoUrl: raw.store.logoUrl,
      totalSold: row._sum?.quantity ?? 0, hasOptions: Boolean(product.optionGroups?.length) }];
  });
}
const recentSince = () => new Date(Date.now() - 30 * 86400000);

async function listDiscoveryStores(query: StoreListQuery, where: Prisma.StoreWhereInput): Promise<Paginated<Store>> {
  const limit = query.limit ?? Math.min(query.pageSize, 24);
  const since = recentSince();
  const ratings = await prisma.rating.groupBy({ by: ['storeId'], where: { store: where }, _avg: { storeRating: true }, _count: { id: true }, orderBy: [{ _avg: { storeRating: 'desc' } }, { _count: { id: 'desc' } }, { storeId: 'asc' }] });
  const scores = new Map(ratings.map(row => [row.storeId, row]));
  let ids: string[];
  if (query.sort === 'rating') ids = ratings.map(row => row.storeId);
  else {
    const [recent, popular, remaining] = await Promise.all([
      prisma.store.findMany({ where: { AND: [where, { createdAt: { gte: since } }] }, select: { id: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
      prisma.order.groupBy({ by: ['storeId'], where: { store: where, status: 'DELIVERED' }, _count: { id: true }, orderBy: [{ _count: { id: 'desc' } }, { storeId: 'asc' }] }),
      prisma.store.findMany({ where, select: { id: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
    ]);
    ids = [...new Set([...recent.map(row => row.id), ...popular.map(row => row.storeId), ...remaining.map(row => row.id)])];
  }
  const selected = ids.slice((query.page - 1) * limit, query.page * limit);
  const rows = await prisma.store.findMany({ where: { AND: [where, { id: { in: selected } }] } });
  const byId = new Map(rows.map(row => [row.id, row]));
  const estimates = await deliveryEstimates(selected);
  const items = selected.flatMap(id => {
    const row = byId.get(id); if (!row) return [];
    const rating = scores.get(id);
    return [{ ...toStore(row), deliveryEstimate: estimates.get(row.id) ?? null, isRecent: row.createdAt >= since, averageRating: rating?._avg.storeRating ?? null, ratingCount: rating?._count.id ?? 0 }];
  });
  return paginate(items, ids.length, query.page, limit);
}

export async function getNewProducts(limit: number, dishesOnly = false, section: 'discovery' | 'featured' = 'discovery'): Promise<import('@samou-go/shared-types').DiscoveryProduct[]> {
  const since = recentSince();
  const where: Prisma.ProductWhereInput = { ...(dishesOnly ? { id: { in: await dishProductIds(section) }, imageUrl: { not: null }, NOT: { imageUrl: "" } } : {}), isAvailable: true, store: { isActive: true, isApproved: true, storeStatus: { not: 'CLOSED' } } };
  const recent = await prisma.product.findMany({ where: { ...where, createdAt: { gte: since } }, select: { id: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: limit });
  const popular = recent.length < limit ? await prisma.orderItem.groupBy({ by: ['productId'], where: { product: where, order: { status: 'DELIVERED' } }, _sum: { quantity: true }, orderBy: [{ _sum: { quantity: 'desc' } }, { productId: 'asc' }], take: limit }) : [];
  const remaining = recent.length < limit ? await prisma.product.findMany({ where, select: { id: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: limit }) : [];
  const ids = [...new Set([...recent.map(row => row.id), ...popular.flatMap(row => row.productId ? [row.productId] : []), ...remaining.map(row => row.id)])].slice(0, limit);
  const rows = await prisma.product.findMany({ where: { ...where, id: { in: ids } }, include: { store: { select: { nameAr: true, logoUrl: true } }, optionGroups: { orderBy: { sortOrder: 'asc' }, include: { items: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } } } });
  const byId = new Map(rows.map(row => [row.id, row]));
  return ids.flatMap(id => {
    const row = byId.get(id); if (!row) return [];
    const product = toProduct(row);
    return [{ ...product, storeNameAr: row.store.nameAr, storeLogoUrl: row.store.logoUrl, hasOptions: Boolean(product.optionGroups?.length), totalSold: popular.find(p => p.productId === id)?._sum.quantity ?? 0, createdAt: row.createdAt.toISOString(), isRecent: row.createdAt >= since }];
  });
}

/** Search the whole public catalogue; an empty query samples eligible products. */
export async function searchProducts(search: string, page: number, dishesOnly = false, section: 'all' | 'discovery' | 'featured' = 'all') {
  const pageSize = 12;
  const where: Prisma.ProductWhereInput = {
    ...(dishesOnly ? { id: { in: await dishProductIds(section) } } : {}),
    isAvailable: true,
    store: { isActive: true, isApproved: true, storeStatus: { not: 'CLOSED' } },
    ...(search ? { nameAr: caseInsensitiveContains(search) } : {}),
  };
  const total = await prisma.product.count({ where });
  let ids: string[] | undefined;
  if (!search) {
    // Sample IDs only, then hydrate twelve cards including their live options.
    const candidates = await prisma.product.findMany({ where, select: { id: true } });
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const item = candidates[i]!; candidates[i] = candidates[j]!; candidates[j] = item;
    }
    ids = candidates.slice(0, pageSize).map(item => item.id);
  }
  const rows = await prisma.product.findMany({
    where: { ...where, ...(ids ? { id: { in: ids } } : {}) },
    skip: search ? (page - 1) * pageSize : 0, take: pageSize,
    orderBy: [{ nameAr: 'asc' }, { id: 'asc' }],
    include: { store: { select: { nameAr: true, logoUrl: true } }, optionGroups: { orderBy: { sortOrder: 'asc' }, include: { items: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } } },
  });
  const sampledIds = ids;
  if (sampledIds) rows.sort((a, b) => sampledIds.indexOf(a.id) - sampledIds.indexOf(b.id));
  return { items: rows.map(row => { const product = toProduct(row); return { ...product, storeNameAr: row.store.nameAr, storeLogoUrl: row.store.logoUrl, hasOptions: Boolean(product.optionGroups?.length), totalSold: 0 }; }), total, page, pageSize };
}
