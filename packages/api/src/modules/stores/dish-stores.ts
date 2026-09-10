import { DISH_STORE_TYPES, isDishStore } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
/** Resolve across the full catalogue before product pagination or sampling. */
export async function dishStoreIds(): Promise<string[]> {
  const stores = await prisma.store.findMany({
    where: { isActive: true, isApproved: true, OR: [{ storeType: { in: [...DISH_STORE_TYPES] } }, { storeType: null }] },
    select: { id: true, nameAr: true, nameEn: true, storeType: true },
  });
  return stores.filter(isDishStore).map(store => store.id);
}
