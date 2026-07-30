import type { Prisma } from '@prisma/client';
import type { Paginated, Product, Store, StoreWithCatalogue } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/http-error';
import { toProduct, toStore, toStoreWithCatalogue } from './stores.mapper';
import type { ProductListQuery, StoreListQuery } from './stores.schemas';

function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

export async function listStores(query: StoreListQuery): Promise<Paginated<Store>> {
  const where: Prisma.StoreWhereInput = {
    ...(query.activeOnly ? { isActive: true } : {}),
    ...(query.search
      ? {
          OR: [
            { nameAr: { contains: query.search, mode: 'insensitive' } },
            { nameEn: { contains: query.search, mode: 'insensitive' } },
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
    ...(query.search ? { nameAr: { contains: query.search, mode: 'insensitive' } } : {}),
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
