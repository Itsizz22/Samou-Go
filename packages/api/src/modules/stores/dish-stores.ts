import { getPlatformSettings } from '../platform/platform.service';
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
function normalized(value: string): string {
  return value.toLowerCase().normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا');
}
/** Beverage categories catch branded drinks whose names do not describe their contents. */
export function isFoodDish(product: { nameAr: string; category: { nameAr: string; nameEn: string } | null }): boolean {
  const category = normalized(`${product.category?.nameAr ?? ''} ${product.category?.nameEn ?? ''}`);
  if (/مشروبات|عصائر|عصير|قهوة|شاي|beverages|drinks|juices|coffee|tea\b/.test(category)) return false;
  const name = normalized(product.nameAr);
  // Coffee cake and a meal bundle with a drink are still food dishes.
  if (/كيك|كعك|تيراميسو|وجبة|بيتزا|برغر|برجر|ساندويش|cake|tiramisu|meal|pizza|burger|sandwich/.test(name)) return true;
  return !/(^|\s)(ماء|مياه|كوكاكولا|كولا|بيبسي|سبرايت|فانتا|عصير|عصائر|قهوة|شاي|نسكافيه|لاتيه|كابتشينو|اسبريسو|مشروب|مشروبات|سموذي|ميلك\s?شيك|water|coca[ -]?cola|cola|coke|pepsi|sprite|fanta|juice|coffee|tea|latte|cappuccino|espresso|smoothie|milkshake)(\s|$|[،—-])/.test(name);
}
export async function dishProductIds(section: 'discovery' | 'featured' | 'all' = 'all'): Promise<string[]> {
  const settings = section === 'all' ? null : await getPlatformSettings();
  const categoryIds = section === 'discovery' ? settings?.discoveryCategoryIds : settings?.featuredCategoryIds;
  const products = await prisma.product.findMany({
    where: { ...(categoryIds ? { categoryId: { in: categoryIds } } : {}), storeId: { in: await dishStoreIds() }, isAvailable: true, imageUrl: { not: null }, NOT: { imageUrl: '' } },
    select: { id: true, nameAr: true, category: { select: { nameAr: true, nameEn: true } } },
  });
  return products.filter(isFoodDish).map(product => product.id);
}

export async function dishCategoryOptions() {
  return prisma.category.findMany({ where: { storeId: { in: await dishStoreIds() } }, select: { id: true, nameAr: true, store: { select: { id: true, nameAr: true } } }, orderBy: [{ storeId: 'asc' }, { sortOrder: 'asc' }, { nameAr: 'asc' }] });
}
