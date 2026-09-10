import type { Store } from './models';
export const DISH_STORE_TYPES = ['RESTAURANT', 'CAFE', 'BAKERY_SWEETS'] as const;
/** Explicit database classification wins; legacy names are only a fallback. */
export function isDishStore(store: Pick<Store, 'nameAr' | 'nameEn' | 'storeType'>): boolean {
  if (store.storeType) return DISH_STORE_TYPES.some(type => type === store.storeType);
  const name = `${store.nameAr} ${store.nameEn}`.toLowerCase();
  if (/سوبرماركت|بقالة|ماركت|ملحمة|جزار|خضار|فواكه|supermarket|grocery|butcher|produce/.test(name)) return false;
  return /مطعم|مطاعم|شاورما|مشاوي|فلافل|مقهى|مقاهي|كافي|كافيه|كوفي|قهوة|حلويات|حلوى|مخبز|مخابز|كيك|restaurant|shawarma|grill|café|cafe|coffee|bakery|sweets|pastry|cake/.test(name);
}
