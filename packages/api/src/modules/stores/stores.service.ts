import type { Prisma } from '../../lib/prisma-types';
import type {
  Category,
  JwtPayload,
  Paginated,
  Product,
  Store,
  StoreWithCatalogue,
  UserRole,
} from '@samou-go/shared-types';
import { UserRole as UserRoleEnum } from '@samou-go/shared-types';
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
    ...(canSeeInactive ? {} : { isActive: true }),
    ...(query.search
      ? {
          OR: [
            { nameAr: caseInsensitiveContains(query.search) },
            { nameEn: caseInsensitiveContains(query.search) },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.store.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.store.count({ where }),
  ]);

  return paginate(rows.map(toStore), total, query.page, query.pageSize);
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
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      categories: {
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        include: {
          products: {
            where: { isAvailable: true },
            orderBy: { nameAr: 'asc' },
          },
        },
      },
    },
  });

  if (!store) throw notFound('المتجر غير موجود / Store not found');
  // A shop that is closed or not yet approved has no public page. Managers
  // preview their own shop through the authenticated `/full` route instead.
  if (!store.isActive || !store.isApproved) {
    throw notFound('المتجر غير موجود / Store not found');
  }

  return toStoreWithCatalogue(store);
}

/**
 * One store with its COMPLETE catalogue — all products regardless of
 * availability. Used by the store manager dashboard so the manager can
 * re-enable a product they previously marked unavailable.
 * Never called from public-facing routes.
 */
export async function getStoreWithFullCatalogue(storeId: string): Promise<StoreWithCatalogue> {
  const store = await prisma.store.findUnique({
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
            // No isAvailable filter — the manager needs to see everything.
            orderBy: { nameAr: 'asc' },
          },
        },
      },
    },
  });

  if (!store) throw notFound('المتجر غير موجود / Store not found');

  return toStoreWithCatalogue(store);
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

  const updated = await prisma.store.update({
    where: { id: storeId },
    data: {
      ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}),
      ...(body.nameEn !== undefined ? { nameEn: body.nameEn } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.isApproved !== undefined ? { isApproved: body.isApproved } : {}),
      ...(body.isAcceptingOrders !== undefined ? { isAcceptingOrders: body.isAcceptingOrders } : {}),
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

  const product = await prisma.product.create({
    data: {
      nameAr: body.nameAr,
      description: body.description ?? null,
      price: body.price,
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
    select: { storeId: true },
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

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.price !== undefined ? { price: body.price } : {}),
      ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
      ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
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
