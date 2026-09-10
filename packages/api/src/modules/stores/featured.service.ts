import { getNewProducts } from './stores.service';
import { dishProductIds, isFoodDish } from './dish-stores';
import { isDishStore } from '@samou-go/shared-types';
import { prisma } from "../../lib/prisma";
import { badRequest } from "../../lib/http-error";
import { toProduct } from "./stores.mapper";

export async function listFeaturedProducts() {
  const rows = await prisma.product.findMany({
    where: {
      id: { in: await dishProductIds('featured') },
      featuredRank: { not: null },
      isAvailable: true,
      imageUrl: { not: null },
      store: {
        isActive: true,
        isApproved: true,
        isAcceptingOrders: true,
        storeStatus: { not: "CLOSED" },
      },
    },
    orderBy: [{ featuredRank: "asc" }, { id: "asc" }],
    take: 12,
    include: {
      store: { select: { nameAr: true, logoUrl: true } },
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  // Keep the showcase useful before an admin selects featured dishes.
  if (!rows.length) return getNewProducts(12, true, 'featured');
  return rows.map((raw) => {
    const product = toProduct(raw);
    return {
      ...product,
      storeNameAr: raw.store.nameAr,
      storeLogoUrl: raw.store.logoUrl,
      totalSold: 0,
      hasOptions: Boolean(product.optionGroups?.length),
    };
  });
}
export async function getFeaturedSelection() {
  return prisma.product.findMany({
    where: { featuredRank: { not: null } },
    orderBy: [{ featuredRank: "asc" }, { id: "asc" }],
    select: {
      id: true,
      nameAr: true,
      imageUrl: true,
      isAvailable: true,
      store: { select: { nameAr: true } },
    },
  });
}
export async function saveFeaturedProducts(ids: string[]) {
  const eligibleIds = new Set(await dishProductIds('featured'));
  if (ids.some(id => !eligibleIds.has(id))) throw badRequest('اختر أطباقًا من الأقسام المسموحة للأطباق المميزة');
  await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: {
        id: { in: ids },
        isAvailable: true,
        store: { isActive: true, isApproved: true },
      },
      select: { id: true, nameAr: true, category: { select: { nameAr: true, nameEn: true } }, imageUrl: true, store: { select: { nameAr: true, nameEn: true, storeType: true } } },
    });
    if (
      products.length !== ids.length ||
      products.some((p) => !p.imageUrl?.trim() || !isDishStore(p.store) || !isFoodDish(p))
    )
      throw badRequest("اختر أطباقًا بصور من المطاعم أو المقاهي أو الحلويات والمخابز المعتمدة");
    // Serialize simultaneous admin edits through the singleton settings row.
    await tx.platformSettings.upsert({
      where: { id: "platform" },
      create: { id: "platform" },
      update: { updatedAt: new Date() },
    });
    await tx.product.updateMany({
      where: { featuredRank: { not: null } },
      data: { featuredRank: null },
    });
    for (const [rank, id] of ids.entries())
      await tx.product.update({ where: { id }, data: { featuredRank: rank } });
  });
  return getFeaturedSelection();
}
