import type {
  Category as PrismaCategory,
  Product as PrismaProduct,
  Store as PrismaStore,
} from '@prisma/client';
import type {
  Category,
  CategoryWithProducts,
  Product,
  Store,
  StoreWithCatalogue,
} from '@samou-go/shared-types';
import { decimalToNumber } from '../../lib/decimal';

export function toStore(store: PrismaStore): Store {
  return {
    id: store.id,
    nameAr: store.nameAr,
    nameEn: store.nameEn,
    logoUrl: store.logoUrl,
    phone: store.phone,
    isActive: store.isActive,
    isApproved: store.isApproved,
    managerId: store.managerId,
    createdAt: store.createdAt.toISOString(),
  };
}

export function toCategory(category: PrismaCategory): Category {
  return {
    id: category.id,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    storeId: category.storeId,
  };
}

export function toProduct(product: PrismaProduct): Product {
  return {
    id: product.id,
    nameAr: product.nameAr,
    description: product.description,
    price: decimalToNumber(product.price),
    imageUrl: product.imageUrl,
    isAvailable: product.isAvailable,
    categoryId: product.categoryId,
    storeId: product.storeId,
  };
}

export function toStoreWithCatalogue(
  store: PrismaStore & { categories: (PrismaCategory & { products: PrismaProduct[] })[] }
): StoreWithCatalogue {
  const categories: CategoryWithProducts[] = store.categories.map(category => ({
    ...toCategory(category),
    products: category.products.map(toProduct),
  }));

  return { ...toStore(store), categories };
}
